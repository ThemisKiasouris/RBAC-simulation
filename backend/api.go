package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// --- Structs for Input Validation (equivalent to Pydantic) ---

type UserCreate struct {
	Username     string `json:"username" binding:"required"`
	PrimaryGroup string `json:"primary_group,default=users"`
	HasSudo      bool   `json:"has_sudo"`
	ShellPath    string `json:"shell_path,default=/bin/bash"`
	DRole        string `json:"d_role,default=user"`
}

type CreateTaskPayload struct {
	TaskName       string `json:"task_name" binding:"required"`
	CronExpression string `json:"cron_expression" binding:"required"`
	CommandToRun   string `json:"command_to_run" binding:"required"`
	RunAsUser      string `json:"run_as_user,default=root"`
}

type UpdateTaskPayload struct {
	CronExpression string `json:"cron_expression" binding:"required"`
	CommandToRun   string `json:"command_to_run" binding:"required"`
	RunAsUser      string `json:"run_as_user" binding:"required"`
}

// --- Helpers ---

func getUserRole(username string) (string, error) {
	var role string
	err := DB.QueryRow("SELECT d_role FROM SystemUsers WHERE username = ?", username).Scan(&role)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("User not found in system")
		}
		return "", err
	}
	return role, nil
}

// --- Endpoints ---

func getKpis(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	var userCount, taskCount, errorCount int

	if role == "manager" {
		DB.QueryRow("SELECT count(*) FROM SystemUsers WHERE expected_state='present'").Scan(&userCount)
		DB.QueryRow("SELECT count(*) FROM ScheduledTasks WHERE expected_state='present'").Scan(&taskCount)
		DB.QueryRow("SELECT count(*) FROM AuditLogs WHERE status = 'ERROR' AND timestamp >= NOW() - INTERVAL 1 DAY").Scan(&errorCount)
	} else {
		userCount = 1
		DB.QueryRow("SELECT count(*) FROM ScheduledTasks WHERE expected_state='present' AND run_as_user = ?", xUser).Scan(&taskCount)
		DB.QueryRow(`
			SELECT COUNT(a.id) FROM AuditLogs a
			JOIN ScheduledTasks s ON a.target_entity = s.task_name
			WHERE a.status = 'ERROR' AND a.timestamp >= NOW() - INTERVAL 1 DAY AND s.run_as_user = ?
		`, xUser).Scan(&errorCount)
	}

	c.JSON(http.StatusOK, gin.H{
		"managed_users": userCount,
		"active_tasks":  taskCount,
		"latest_errors": errorCount,
	})
}

func getLogs(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	limit := 50

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	var rows *sql.Rows
	if role == "manager" {
		rows, err = DB.Query("SELECT id, timestamp, action_type, target_entity, details, status FROM AuditLogs ORDER BY timestamp DESC LIMIT ?", limit)
	} else {
		rows, err = DB.Query(`
			SELECT a.id, a.timestamp, a.action_type, a.target_entity, a.details, a.status 
			FROM AuditLogs a
			JOIN ScheduledTasks s ON a.target_entity = s.task_name
			WHERE s.run_as_user = ?
			ORDER BY a.timestamp DESC LIMIT ?
		`, xUser, limit)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var id int
		var timestamp time.Time
		var actionType, targetEntity, details, status string
		rows.Scan(&id, &timestamp, &actionType, &targetEntity, &details, &status)

		logs = append(logs, map[string]interface{}{
			"id":            id,
			"timestamp":     timestamp.Format("2006-01-02 15:04:05"),
			"action_type":   actionType,
			"target_entity": targetEntity,
			"details":       details,
			"status":        status,
		})
	}

	if logs == nil {
		logs = make([]map[string]interface{}, 0)
	}

	c.JSON(http.StatusOK, logs)
}

func getChartData(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	now := time.Now()
	start := now.AddDate(0, 0, -6).Format("2006-01-02") + " 00:00:00"

	query := `
		SELECT DATE(timestamp) AS day,
			SUM(IF(status = 'SUCCESS', 1, 0)) AS success_count,
			SUM(IF(status = 'ERROR', 1, 0)) AS error_count
		FROM AuditLogs`
	params := []interface{}{}

	// Fix applied here: Ensure WHERE is only inserted once, correctly.
	if role != "manager" {
		query += `
		JOIN ScheduledTasks s ON AuditLogs.target_entity = s.task_name
		WHERE s.run_as_user = ? AND timestamp >= ?`
		params = append(params, xUser, start)
	} else {
		query += ` WHERE timestamp >= ?`
		params = append(params, start)
	}

	query += `
		GROUP BY day
		ORDER BY day DESC`

	rows, err := DB.Query(query, params...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	defer rows.Close()

	totals := make(map[string]map[string]int)
	for rows.Next() {
		var day time.Time
		var successCount, errorCount int
		if err := rows.Scan(&day, &successCount, &errorCount); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
			return
		}
		totals[day.Format("2006-01-02")] = map[string]int{"success": successCount, "error": errorCount}
	}

	response := make([]map[string]interface{}, 0, 7)
	for i := 6; i >= 0; i-- {
		dateObj := now.AddDate(0, 0, -i)
		dateKey := dateObj.Format("2006-01-02")

		// Fix applied here: Format the date exactly how the React chart expects it
		formattedDate := dateObj.Format("Jan 02") // e.g., "Jul 17"

		counts := totals[dateKey]
		if counts == nil {
			counts = map[string]int{"success": 0, "error": 0}
		}
		response = append(response, map[string]interface{}{
			"date":    formattedDate,
			"success": counts["success"],
			"error":   counts["error"],
		})
	}

	c.JSON(http.StatusOK, response)
}

func getUsers(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	var rows *sql.Rows
	if role == "manager" {
		rows, err = DB.Query("SELECT id, username, primary_group, has_sudo, shell_path, expected_state, d_role FROM SystemUsers")
	} else {
		rows, err = DB.Query("SELECT id, username, primary_group, has_sudo, shell_path, expected_state, d_role FROM SystemUsers WHERE username = ?", xUser)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	defer rows.Close()

	users := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id int
		var username, primaryGroup, shellPath, expectedState, dRole string
		var hasSudo bool
		rows.Scan(&id, &username, &primaryGroup, &hasSudo, &shellPath, &expectedState, &dRole)
		users = append(users, map[string]interface{}{
			"id":             id,
			"username":       username,
			"primary_group":  primaryGroup,
			"has_sudo":       hasSudo,
			"shell_path":     shellPath,
			"expected_state": expectedState,
			"d_role":         dRole,
		})
	}

	if users == nil {
		users = make([]map[string]interface{}, 0)
	}
	c.JSON(http.StatusOK, users)
}

func createUser(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	if role != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Only managers may create users"})
		return
	}

	var payload UserCreate
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	if payload.PrimaryGroup == "" {
		payload.PrimaryGroup = "users"
	}
	if payload.ShellPath == "" {
		payload.ShellPath = "/bin/bash"
	}
	if payload.DRole == "" {
		payload.DRole = "user"
	}

	_, err = DB.Exec(
		"INSERT INTO SystemUsers (username, primary_group, has_sudo, shell_path, expected_state, d_role) VALUES (?, ?, ?, ?, 'present', ?)",
		payload.Username, payload.PrimaryGroup, payload.HasSudo, payload.ShellPath, payload.DRole,
	)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate") || strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"detail": "Username already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"detail": "User created"})
}

func getTasks(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	var rows *sql.Rows
	query := `SELECT task_id, 
	task_name, 
	cron_expression, 
	command_to_run, 
	run_as_user, 
	expected_state FROM ScheduledTasks WHERE expected_state = 'present'`
	if role == "manager" {
		rows, err = DB.Query(query)
	} else {
		rows, err = DB.Query(query+" AND run_as_user = ?", xUser)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	defer rows.Close()

	tasks := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id int
		var taskName, cronExpression, commandToRun, runAsUser, expectedState string
		rows.Scan(&id, &taskName, &cronExpression, &commandToRun, &runAsUser, &expectedState)
		tasks = append(tasks, map[string]interface{}{
			"task_id":         id,
			"task_name":       taskName,
			"cron_expression": cronExpression,
			"command_to_run":  commandToRun,
			"run_as_user":     runAsUser,
			"expected_state":  expectedState,
		})
	}

	if tasks == nil {
		tasks = make([]map[string]interface{}, 0)
	}
	c.JSON(http.StatusOK, tasks)
}

func createTask(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	var payload CreateTaskPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	if payload.RunAsUser == "" {
		payload.RunAsUser = "root"
	}

	if role != "manager" && payload.RunAsUser != xUser {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Standard users may only create tasks for themselves"})
		return
	}

	_, err = DB.Exec(
		"INSERT INTO ScheduledTasks (task_name, cron_expression, command_to_run, run_as_user, expected_state) VALUES (?, ?, ?, ?, 'present')",
		payload.TaskName, payload.CronExpression, payload.CommandToRun, payload.RunAsUser,
	)
	if err != nil {
		if strings.Contains(err.Error(), "Duplicate") || strings.Contains(err.Error(), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"detail": "Task name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"detail": "Task created"})
}

func updateTask(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	taskID := c.Param("id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Task ID is required"})
		return
	}

	var currentRunAs, currentState string
	// Fix applied here: Checked task_id
	if err := DB.QueryRow("SELECT run_as_user, expected_state FROM ScheduledTasks WHERE task_id = ?", taskID).Scan(&currentRunAs, &currentState); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"detail": "Task not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	if role != "manager" && currentRunAs != xUser {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Standard users may only edit their own tasks"})
		return
	}

	var payload UpdateTaskPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	if role != "manager" && payload.RunAsUser != xUser {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Standard users may not reassign tasks"})
		return
	}

	// Fix applied here: Updated task_id
	_, err = DB.Exec(
		"UPDATE ScheduledTasks SET cron_expression = ?, command_to_run = ?, run_as_user = ? WHERE task_id = ?",
		payload.CronExpression, payload.CommandToRun, payload.RunAsUser, taskID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"detail": "Task updated"})
}

func deleteTask(c *gin.Context) {
	xUser := c.GetHeader("x-user")
	if xUser == "" {
		xUser = "root_admin"
	}

	role, err := getUserRole(xUser)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
		return
	}

	if role != "manager" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Only managers may delete tasks"})
		return
	}

	taskID := c.Param("id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Task ID is required"})
		return
	}

	// Fix applied here: Used task_id and marked as absent
	res, err := DB.Exec("UPDATE ScheduledTasks SET expected_state = 'absent' WHERE task_id = ?", taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Task not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"detail": "Task marked for deletion"})
}

func main() {
	InitDB()
	r := gin.Default()

	// CORS Setup
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"*"},
		AllowHeaders:     []string{"*"},
		AllowCredentials: true,
	}))

	r.GET("/api/kpis", getKpis)
	r.GET("/api/logs", getLogs)
	r.GET("/api/chart-data", getChartData)
	r.GET("/api/users", getUsers)
	r.POST("/api/users", createUser) // Fix: Match frontend URL precisely
	r.GET("/api/tasks", getTasks)
	r.POST("/api/tasks", createTask)
	r.PUT("/api/tasks/:id", updateTask)
	r.DELETE("/api/tasks/:id", deleteTask)

	log.Println("Starting server on port 8000...")
	r.Run(":8000")
}
