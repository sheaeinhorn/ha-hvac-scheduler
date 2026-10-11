"""Config flow for HVAC Scheduler. Each config entry is one schedule."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_COOL_SETPOINT,
    CONF_ENABLED,
    CONF_HEAT_SETPOINT,
    CONF_MODE,
    CONF_TIME,
    DAYS,
    DEFAULTS,
    DOMAIN,
    MODES,
)


def _schedule_schema(values: dict[str, Any]) -> dict:
    """Fields shared by the create and options forms."""
    return {
        vol.Required(CONF_TIME, default=values[CONF_TIME]): selector.TimeSelector(),
        vol.Required(CONF_ENABLED, default=values[CONF_ENABLED]): selector.BooleanSelector(),
        **{
            vol.Required(day, default=values[day]): selector.BooleanSelector()
            for day in DAYS
        },
        vol.Required(
            CONF_COOL_SETPOINT, default=values[CONF_COOL_SETPOINT]
        ): selector.NumberSelector(
            selector.NumberSelectorConfig(min=40, max=100, step=1, mode="box")
        ),
        vol.Required(
            CONF_HEAT_SETPOINT, default=values[CONF_HEAT_SETPOINT]
        ): selector.NumberSelector(
            selector.NumberSelectorConfig(min=40, max=100, step=1, mode="box")
        ),
        vol.Required(CONF_MODE, default=values[CONF_MODE]): selector.SelectSelector(
            selector.SelectSelectorConfig(options=MODES, translation_key=CONF_MODE)
        ),
    }


def _normalize(user_input: dict[str, Any]) -> dict[str, Any]:
    """NumberSelector returns floats; setpoints are ints."""
    options = {k: v for k, v in user_input.items() if k != CONF_NAME}
    options[CONF_COOL_SETPOINT] = int(options[CONF_COOL_SETPOINT])
    options[CONF_HEAT_SETPOINT] = int(options[CONF_HEAT_SETPOINT])
    return options


class HvacSchedulerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create a new schedule."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            name = user_input[CONF_NAME]
            return self.async_create_entry(
                title=name, data={CONF_NAME: name}, options=_normalize(user_input)
            )

        schema = vol.Schema(
            {vol.Required(CONF_NAME): selector.TextSelector(), **_schedule_schema(DEFAULTS)}
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return HvacSchedulerOptionsFlow()


class HvacSchedulerOptionsFlow(OptionsFlow):
    """Edit an existing schedule from the UI."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=_normalize(user_input))

        values = {**DEFAULTS, **self.config_entry.options}
        return self.async_show_form(
            step_id="init", data_schema=vol.Schema(_schedule_schema(values))
        )
