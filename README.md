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

## Time card

A small time picker for one schedule. It comes with the integration and loads automatically, so you don't need a separate install or dashboard resource. Find it in the card picker as *HVAC Scheduler Time*, or use YAML:

```yaml
type: custom:hvac-scheduler-time-card
entity: sensor.morning
name: Morning      # optional
hide_name: false   # optional
hour_mode: 12      # optional: 12 or 24, defaults to your profile setting
minute_step: 5     # optional
font_size: 26      # optional: number size in px, or any CSS size like 2rem
```

- Use the arrows to change hours and minutes, and the AM/PM button to switch halves of the day.
- Tap the hour or minute to type it; phones open a number keypad. Enter saves and Esc cancels.
- Changes are saved a second after you stop clicking.

## Slider card

A Bubble Card style slider for a schedule's cool or heat setpoint. It also comes with the integration. Find it in the card picker as *HVAC Scheduler Slider*, or use YAML:

```yaml
type: custom:hvac-scheduler-slider-card
entity: sensor.morning
attribute: cool_setpoint   # or heat_setpoint
name: Cool                 # optional
icon: mdi:snowflake        # optional
min: 60                    # optional, default 50 °F / 10 °C
max: 85                    # optional, default 90 °F / 32 °C
step: 1                    # optional
color: "#2b9af9"           # optional fill color
```

- Drag (or tap) anywhere on the card. The value is saved when you let go.
- Arrow keys work when the card has keyboard focus.

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

## Service: `hvac_scheduler.toggle`

Flips one setting: `enabled`, a day (`sunday` … `saturday`), or `mode` (on ↔ off). It's useful for dashboard buttons, because tap actions can't use templates.

```yaml
tap_action:
  action: perform-action
  perform_action: hvac_scheduler.toggle
  target:
    entity_id: sensor.testing
  data:
    attribute: sunday
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
