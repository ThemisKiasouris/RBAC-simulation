package main

import (
	"database/sql"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"
)

type Daemon struct {
	db *sql.DB
}

func (d *Daemon) userExists(username string) bool {
	cmd := exec.Command("id", "-u", username)
	err := cmd.Run()
	return err == nil
}

func (d *Daemon) reconcileUsers() {
	log.Println("Starting user reconciliation cycle...")

	rows, err := d.db.Query("SELECT username, primary_group, has_sudo, shell_path, expected_state FROM SystemUsers")
	if err != nil {
		log.Printf("Error fetching users: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var username, primaryGroup, shellPath, expectedState string
		var hasSudo bool
		rows.Scan(&username, &primaryGroup, &hasSudo, &shellPath, &expectedState)

		isPresent := d.userExists(username)

		if expectedState == "present" && !isPresent {
			log.Printf("Drift detected: Creating missing user '%s'", username)

			args := []string{"-m", "-g", primaryGroup, "-s", shellPath}
			if hasSudo {
				args = append(args, "-G", "sudo")
			}
			args = append(args, username)

			cmdString := "useradd " + strings.Join(args, " ")
			cmd := exec.Command("useradd", args...)

			output, err := cmd.CombinedOutput()
			if err != nil {
				log.Printf("Error creating user '%s': %s", username, string(output))
				d.logAction("USER_CREATE", username, cmdString, "FAILURE: "+string(output))
			} else {
				log.Printf("Success: '%s' created.", username)
				d.logAction("USER_CREATE", username, cmdString, "SUCCESS")
			}

		} else if expectedState == "absent" && isPresent {
			log.Printf("Drift detected: Removing revoked user '%s'", username)

			cmdString := fmt.Sprintf("userdel -r %s", username)
			cmd := exec.Command("userdel", "-r", username)

			output, err := cmd.CombinedOutput()
			if err != nil {
				log.Printf("Error removing user '%s': %s", username, string(output))
				d.logAction("USER_DELETE", username, cmdString, "FAILURE: "+string(output))
			} else {
				log.Printf("Success: '%s' removed.", username)
				d.logAction("USER_DELETE", username, cmdString, "SUCCESS")
			}
		}
	}
}

func (d *Daemon) getCrontab(systemUser string) string {
	cmd := exec.Command("crontab", "-l", "-u", systemUser)
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return string(output)
}

func (d *Daemon) setCrontab(systemUser, cronContent string) error {
	cmd := exec.Command("crontab", "-u", systemUser, "-")
	cmd.Stdin = strings.NewReader(cronContent)
	return cmd.Run()
}

func (d *Daemon) reconcileTasks() {
	log.Println("Starting task reconciliation cycle...")

	rows, err := d.db.Query("SELECT task_name, cron_expression, command_to_run, run_as_user, expected_state FROM ScheduledTasks")
	if err != nil {
		log.Printf("Error fetching tasks: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var taskName, cronExpression, commandToRun, runAsUser, expectedState string
		rows.Scan(&taskName, &cronExpression, &commandToRun, &runAsUser, &expectedState)

		cronLine := fmt.Sprintf("%s %s # MANAGED BY DAEMON: %s", cronExpression, commandToRun, taskName)
		currentCrontab := d.getCrontab(runAsUser)
		isPresent := strings.Contains(currentCrontab, cronLine)

		if expectedState == "present" && !isPresent {
			log.Printf("Drift detected: Creating missing task '%s'", taskName)
			newCrontab := currentCrontab + "\n" + cronLine + "\n"

			err := d.setCrontab(runAsUser, newCrontab)
			if err != nil {
				log.Printf("Error creating task '%s': %v", taskName, err)
				d.logAction("CRON_CREATE", taskName, err.Error(), "ERROR")
			} else {
				log.Printf("Success: '%s' scheduled.", taskName)
				d.logAction("CRON_CREATE", taskName, "Assigned to: "+runAsUser, "SUCCESS")
			}

		} else if expectedState == "absent" && isPresent {
			log.Printf("Drift detected: Removing revoked task '%s'", taskName)

			var cleanedLines []string
			for _, line := range strings.Split(currentCrontab, "\n") {
				if !strings.Contains(line, taskName) && line != "" {
					cleanedLines = append(cleanedLines, line)
				}
			}
			newCrontab := strings.Join(cleanedLines, "\n") + "\n"

			err := d.setCrontab(runAsUser, newCrontab)
			if err != nil {
				log.Printf("Error removing task '%s': %v", taskName, err)
				d.logAction("CRON_DELETE", taskName, err.Error(), "ERROR")
			} else {
				log.Printf("Success: '%s' removed.", taskName)
				d.logAction("CRON_DELETE", taskName, "Removed from: "+runAsUser, "SUCCESS")
			}
		}
	}
}

func (d *Daemon) logAction(actionType, targetEntity, details, status string) {
	_, err := d.db.Exec(`
		INSERT INTO AuditLogs (action_type, target_entity, details, status)
		VALUES (?, ?, ?, ?)`, actionType, targetEntity, details, status)

	if err != nil {
		log.Printf("Database Logging Error: %v", err)
	}
}

func (d *Daemon) runForever(interval time.Duration) {
	for {
		d.reconcileUsers()
		d.reconcileTasks()
		time.Sleep(interval)
	}
}
