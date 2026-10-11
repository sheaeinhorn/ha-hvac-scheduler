# HVAC Scheduler

A small Home Assistant integration for HVAC schedules. Each schedule you add becomes one sensor:

- **State:** a timestamp: the date and time of the next run. It only lands on days that are checked, and it is `unknown` while the schedule is disabled.
- **Attributes:** `time`, `enabled`, `sunday` … `saturday`, `cool_setpoint`, `heat_setpoint`, `mode` (`on`/`off`), plus `active_today` (computed)

Settings are stored in the config entry, so they survive Home Assistant restarts.

## Install (HACS)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/sheaeinhorn/ha-hvac-scheduler`, category **Integration**.
2. Install **HVAC Scheduler** and restart Home Assistant.
3. Settings → Devices & Services → **Add Integration** → *HVAC Scheduler*. Repeat for every schedule you want.

Edit a schedule from the UI with **Configure** on its entry, or with the service below.

## Service: `hvac_scheduler.update_schedule`

Only the fields you pass are changed.

```yaml
action: hvac_scheduler.update_schedule
target:
  entity_id: sensor.morning
data:
  time: "06:30:00"
  enabled: true
  saturday: false
  sunday: false
  cool_setpoint: 74
  heat_setpoint: 69
  mode: "on"
```

## Automation example

Because the state is a timestamp, use the normal time trigger. It only fires on enabled days.

```yaml
triggers:
  - trigger: time
    at: sensor.morning
conditions:
  - condition: state
    entity_id: sensor.morning
    attribute: mode
    state: "on"
actions:
  - action: climate.set_temperature
    target:
      entity_id: climate.thermostat
    data:
      target_temp_low: "{{ state_attr('sensor.morning', 'heat_setpoint') }}"
      target_temp_high: "{{ state_attr('sensor.morning', 'cool_setpoint') }}"
```

One automation can handle all schedules: list every schedule sensor under `at:` and read the attributes from `trigger.entity_id`.
