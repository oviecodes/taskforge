#!/bin/sh
set -e

# Replace placeholders with environment variable values in the config file
sed -i "s|\${ALERT_EMAIL_TO}|${ALERT_EMAIL_TO}|g" /etc/alertmanager/alertmanager.yml

sed -i "s|\${SLACK_WEBHOOK_URL}|${SLACK_WEBHOOK_URL}|g" /etc/alertmanager/alertmanager.yml

# Start Alertmanager
exec alertmanager --config.file=/etc/alertmanager/alertmanager.yml