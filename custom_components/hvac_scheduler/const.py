"""Constants for HVAC Scheduler."""

DOMAIN = "hvac_scheduler"

CONF_TIME = "time"
CONF_ENABLED = "enabled"
CONF_COOL_SETPOINT = "cool_setpoint"
CONF_HEAT_SETPOINT = "heat_setpoint"
CONF_MODE = "mode"

# Ordered Sunday..Saturday. Index in this list != Python weekday(), see WEEKDAY_TO_DAY.
DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
# Python datetime.weekday(): Monday=0 .. Sunday=6
WEEKDAY_TO_DAY = {0: "monday", 1: "tuesday", 2: "wednesday", 3: "thursday", 4: "friday", 5: "saturday", 6: "sunday"}

MODE_ON = "on"
MODE_OFF = "off"
MODES = [MODE_ON, MODE_OFF]

SERVICE_UPDATE = "update_schedule"
SERVICE_TOGGLE = "toggle"

ATTR_ATTRIBUTE = "attribute"

DEFAULTS = {
    CONF_TIME: "07:00:00",
    CONF_ENABLED: True,
    **{day: True for day in DAYS},
    CONF_COOL_SETPOINT: 75,
    CONF_HEAT_SETPOINT: 68,
    CONF_MODE: MODE_ON,
}
