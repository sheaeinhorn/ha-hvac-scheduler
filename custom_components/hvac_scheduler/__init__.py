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
    CONF_COOL_SETPOINT,
    CONF_ENABLED,
    CONF_HEAT_SETPOINT,
    CONF_MODE,
    CONF_TIME,
    DAYS,
    DOMAIN,
    MODES,
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


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the update service."""

    async def handle_update(call: ServiceCall) -> None:
        changes = {k: v for k, v in call.data.items() if k != ATTR_ENTITY_ID}
        if CONF_TIME in changes:
            changes[CONF_TIME] = changes[CONF_TIME].strftime("%H:%M:%S")

        registry = er.async_get(hass)
        for entity_id in call.data[ATTR_ENTITY_ID]:
            reg_entry = registry.async_get(entity_id)
            entry = (
                hass.config_entries.async_get_entry(reg_entry.config_entry_id)
                if reg_entry and reg_entry.config_entry_id
                else None
            )
            if entry is None or entry.domain != DOMAIN:
                raise ServiceValidationError(
                    f"{entity_id} is not a {DOMAIN} schedule"
                )
            # Options are persisted in .storage/core.config_entries, so they survive restarts.
            hass.config_entries.async_update_entry(
                entry, options={**entry.options, **changes}
            )

    hass.services.async_register(DOMAIN, SERVICE_UPDATE, handle_update, UPDATE_SCHEMA)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up a schedule from a config entry."""
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a schedule."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
