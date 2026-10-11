"""Schedule sensor: state is the next run (timestamp), settings are attributes."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.util import dt as dt_util

from .const import (
    CONF_COOL_SETPOINT,
    CONF_ENABLED,
    CONF_HEAT_SETPOINT,
    CONF_MODE,
    CONF_TIME,
    DAYS,
    DEFAULTS,
    WEEKDAY_TO_DAY,
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([ScheduleSensor(entry)])


class ScheduleSensor(SensorEntity):
    """One schedule. Settings live in the config entry options so they persist."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_icon = "mdi:calendar-clock"
    _attr_should_poll = False

    def __init__(self, entry: ConfigEntry) -> None:
        self._entry = entry
        self._attr_unique_id = entry.entry_id
        self._attr_name = entry.title
        self._unsub_timer: CALLBACK_TYPE | None = None

    @property
    def _options(self) -> dict[str, Any]:
        return {**DEFAULTS, **self._entry.options}

    @property
    def native_value(self) -> datetime | None:
        """Next run; unknown when disabled or no days selected, so time triggers won't fire."""
        return self._next_run()

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        opts = self._options
        return {
            CONF_TIME: opts[CONF_TIME],
            CONF_ENABLED: opts[CONF_ENABLED],
            **{day: opts[day] for day in DAYS},
            CONF_COOL_SETPOINT: opts[CONF_COOL_SETPOINT],
            CONF_HEAT_SETPOINT: opts[CONF_HEAT_SETPOINT],
            CONF_MODE: opts[CONF_MODE],
            "active_today": opts[CONF_ENABLED]
            and opts[WEEKDAY_TO_DAY[dt_util.now().weekday()]],
        }

    def _next_run(self) -> datetime | None:
        """Next datetime this schedule fires, honoring enabled + weekdays."""
        opts = self._options
        if not opts[CONF_ENABLED]:
            return None
        at = time.fromisoformat(opts[CONF_TIME])
        now = dt_util.now()
        for offset in range(8):
            day = now.date() + timedelta(days=offset)
            if not opts[WEEKDAY_TO_DAY[day.weekday()]]:
                continue
            candidate = datetime.combine(day, at, tzinfo=now.tzinfo)
            if candidate > now:
                return candidate
        return None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._entry.add_update_listener(self._on_entry_update))
        self.async_on_remove(self._cancel_timer)
        self._schedule_refresh()

    async def _on_entry_update(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Options changed (service call or options flow)."""
        self._schedule_refresh()
        self.async_write_ha_state()

    @callback
    def _cancel_timer(self) -> None:
        if self._unsub_timer:
            self._unsub_timer()
            self._unsub_timer = None

    @callback
    def _schedule_refresh(self) -> None:
        """Re-render attributes right after each run, and at midnight for active_today."""
        self._cancel_timer()
        now = dt_util.now()
        midnight = dt_util.start_of_local_day(now + timedelta(days=1))
        next_run = self._next_run()
        target = min(next_run, midnight) if next_run else midnight
        self._unsub_timer = async_track_point_in_time(
            self.hass, self._on_timer, target + timedelta(seconds=1)
        )

    @callback
    def _on_timer(self, _now: datetime) -> None:
        self._unsub_timer = None
        self._schedule_refresh()
        self.async_write_ha_state()
