"""HVAC Scheduler integration."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_ENTITY_ID, Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.helpers.typing import ConfigType

from .const import (
    ATTR_ATTRIBUTE,
    CONF_COOL_SETPOINT,
    CONF_ENABLED,
    CONF_HEAT_SETPOINT,
    CONF_MODE,
    CONF_TIME,
    DAYS,
    DOMAIN,
    DEFAULTS,
    MODE_OFF,
    MODE_ON,
    MODES,
    SERVICE_TOGGLE,
    SERVICE_UPDATE,
)

PLATFORMS = [Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

UPDATE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Optional(CONF_TIME): cv.time,
        vol.Optional(CONF_ENABLED): cv.boolean,
        **{vol.Optional(day): cv.boolean for day in DAYS},
        vol.Optional(CONF_COOL_SETPOINT): vol.Coerce(int),
        vol.Optional(CONF_HEAT_SETPOINT): vol.Coerce(int),
        vol.Optional(CONF_MODE): vol.In(MODES),
    }
)

TOGGLE_ATTRIBUTES = [CONF_ENABLED, *DAYS, CONF_MODE]

TOGGLE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Required(ATTR_ATTRIBUTE): vol.In(TOGGLE_ATTRIBUTES),
    }
)


def _schedule_entries(hass: HomeAssistant, call: ServiceCall) -> list[ConfigEntry]:
    """Config entries behind the targeted schedule sensors."""
    registry = er.async_get(hass)
    entries = []
    for entity_id in call.data[ATTR_ENTITY_ID]:
        reg_entry = registry.async_get(entity_id)
        entry = (
            hass.config_entries.async_get_entry(reg_entry.config_entry_id)
            if reg_entry and reg_entry.config_entry_id
            else None
        )
        if entry is None or entry.domain != DOMAIN:
            raise ServiceValidationError(f"{entity_id} is not a {DOMAIN} schedule")
        entries.append(entry)
    return entries


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the services."""

    async def handle_update(call: ServiceCall) -> None:
        changes = {k: v for k, v in call.data.items() if k != ATTR_ENTITY_ID}
        if CONF_TIME in changes:
            changes[CONF_TIME] = changes[CONF_TIME].strftime("%H:%M:%S")

        for entry in _schedule_entries(hass, call):
            # Options are persisted in .storage/core.config_entries, so they survive restarts.
            hass.config_entries.async_update_entry(
                entry, options={**entry.options, **changes}
            )

    async def handle_toggle(call: ServiceCall) -> None:
        attribute = call.data[ATTR_ATTRIBUTE]
        for entry in _schedule_entries(hass, call):
            current = {**DEFAULTS, **entry.options}[attribute]
            if attribute == CONF_MODE:
                new = MODE_OFF if current == MODE_ON else MODE_ON
            else:
                new = not current
            hass.config_entries.async_update_entry(
                entry, options={**entry.options, attribute: new}
            )

    hass.services.async_register(DOMAIN, SERVICE_UPDATE, handle_update, UPDATE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_TOGGLE, handle_toggle, TOGGLE_SCHEMA)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up a schedule from a config entry."""
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a schedule."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
