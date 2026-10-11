/*
 * HVAC Scheduler time card: a small time picker for one schedule.
 * Served by the hvac_scheduler integration and loaded on every dashboard automatically.
 *
 *   type: custom:hvac-scheduler-time-card
 *   entity: sensor.morning
 *   name: Morning        # optional, defaults to the entity name
 *   hide_name: false     # optional
 *   hour_mode: 12        # optional, 12 or 24, defaults to your profile setting
 *   minute_step: 5       # optional
 *   font_size: 26        # optional, number size in px (or any CSS size, e.g. 2rem)
 */

const DOMAIN = "hvac_scheduler";
const SERVICE = "update_schedule";
const CARD = "hvac-scheduler-time-card";
const SEND_DELAY_MS = 1000;
const PENDING_TTL_MS = 5000;
const DAY_MINUTES = 24 * 60;

const STYLE = `
  ha-card { height: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 12px; padding: 8px 16px; }
  .name { flex: 1; min-width: 0; font-size: 1rem; font-weight: 500; color: var(--primary-text-color);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name[hidden] { display: none; }
  .picker { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .unit { display: flex; flex-direction: column; align-items: center; }
  .value { font: inherit; font-size: var(--hvac-time-size, 1.6rem); font-variant-numeric: tabular-nums; color: var(--primary-text-color);
           line-height: 1.2; width: 2.4ch; padding: 0 2px; text-align: center; background: transparent;
           border: 1px solid transparent; border-radius: 6px; caret-color: var(--primary-color); }
  .value:hover { border-color: var(--divider-color); }
  .value:focus { outline: none; border-color: var(--primary-color); }
  .sep { font-size: var(--hvac-time-size, 1.6rem); color: var(--primary-text-color); padding-bottom: 2px; }
  button { font: inherit; cursor: pointer; border: none; background: transparent; color: var(--secondary-text-color);
           border-radius: 50%; width: 32px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; }
  button:hover { color: var(--primary-color); background: var(--secondary-background-color); }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .ampm { width: auto; height: auto; border-radius: 8px; padding: 6px 10px; margin-left: 6px;
          border: 1px solid var(--divider-color); color: var(--primary-text-color); font-weight: 500; }
  .ampm[hidden] { display: none; }
  .pending .value, .pending .sep { color: var(--primary-color); }
  .warning { color: var(--error-color); font-size: 0.9rem; }
`;

const pad = (n) => String(n).padStart(2, "0");

class HvacSchedulerTimeCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("Choose a schedule entity");
    this._config = config;
    this._pending = null; // { minutes, expires }
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  static getStubConfig(hass) {
    const first = Object.values(hass.entities || {}).find((e) => e.platform === DOMAIN);
    return { entity: first ? first.entity_id : "" };
  }

  // Visual editor (Home Assistant 2024.12+).
  static getConfigForm() {
    const labels = {
      entity: "Schedule",
      name: "Name",
      hide_name: "Hide name",
      hour_mode: "Clock",
      minute_step: "Minute step",
      font_size: "Number size (px)",
    };
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { filter: { integration: DOMAIN } } } },
        { name: "name", selector: { text: {} } },
        {
          type: "grid",
          name: "",
          schema: [
            {
              name: "hour_mode",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "12", label: "12-hour" },
                    { value: "24", label: "24-hour" },
                  ],
                },
              },
            },
            { name: "minute_step", selector: { number: { min: 1, max: 30, mode: "box" } } },
          ],
        },
        { name: "font_size", selector: { number: { min: 12, max: 96, step: 1, mode: "slider", unit_of_measurement: "px" } } },
        { name: "hide_name", selector: { boolean: {} } },
      ],
      computeLabel: (s) => labels[s.name],
    };
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: 6, rows: 2, min_columns: 4, min_rows: 2 };
  }

  _is12h() {
    const mode = this._config.hour_mode;
    if (mode !== undefined && mode !== "") return String(mode) === "12";
    const fmt = this._hass.locale && this._hass.locale.time_format;
    if (fmt === "12") return true;
    if (fmt === "24") return false;
    const lang = (this._hass.locale && this._hass.locale.language) || this._hass.language;
    return !!new Intl.DateTimeFormat(lang, { hour: "numeric" }).resolvedOptions().hour12;
  }

  // Minutes since midnight from HA, or the value the user just picked.
  _minutes() {
    const st = this._hass.states[this._config.entity];
    const [h, m] = String((st && st.attributes.time) || "00:00").split(":").map(Number);
    const actual = (h || 0) * 60 + (m || 0);
    if (this._pending) {
      if (this._pending.minutes === actual && !this._sendTimer) this._pending = null;
      else if (Date.now() > this._pending.expires && !this._sendTimer) this._pending = null;
      else return this._pending.minutes;
    }
    return actual;
  }

  _change(minutes) {
    minutes = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    this._pending = { minutes, expires: Date.now() + SEND_DELAY_MS + PENDING_TTL_MS };
    this._render();
    clearTimeout(this._sendTimer);
    // Wait for the user to stop clicking, then save once.
    this._sendTimer = setTimeout(() => {
      this._sendTimer = null;
      this._pending.expires = Date.now() + PENDING_TTL_MS;
      const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;
      this._hass
        .callService(DOMAIN, SERVICE, { entity_id: this._config.entity, time })
        .catch((err) => {
          this._pending = null;
          this._render();
          this.dispatchEvent(
            new CustomEvent("hass-notification", {
              detail: { message: `HVAC Scheduler: ${err.message || err}` },
              bubbles: true,
              composed: true,
            })
          );
        });
    }, SEND_DELAY_MS);
  }

  _build() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="name"></div>
        <div class="picker">
          <div class="unit">
            <button data-step="hour-up" aria-label="Hour up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <input class="value hour" inputmode="numeric" pattern="[0-9]*" maxlength="2" enterkeyhint="done" aria-label="Hour">
            <button data-step="hour-down" aria-label="Hour down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
          </div>
          <div class="sep">:</div>
          <div class="unit">
            <button data-step="minute-up" aria-label="Minute up"><ha-icon icon="mdi:chevron-up"></ha-icon></button>
            <input class="value minute" inputmode="numeric" pattern="[0-9]*" maxlength="2" enterkeyhint="done" aria-label="Minute">
            <button data-step="minute-down" aria-label="Minute down"><ha-icon icon="mdi:chevron-down"></ha-icon></button>
          </div>
          <button class="ampm" aria-label="Switch AM/PM"></button>
        </div>
        <div class="warning" hidden></div>
      </ha-card>`;
    const root = this.shadowRoot;
    this._refs = {
      card: root.querySelector("ha-card"),
      name: root.querySelector(".name"),
      picker: root.querySelector(".picker"),
      hour: root.querySelector(".hour"),
      minute: root.querySelector(".minute"),
      ampm: root.querySelector(".ampm"),
      warning: root.querySelector(".warning"),
    };

    root.querySelectorAll("[data-step]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const total = this._minutes();
        const h = Math.floor(total / 60);
        const m = total % 60;
        const step = Math.max(1, Number(this._config.minute_step) || 5);
        switch (btn.dataset.step) {
          case "hour-up":
            return this._change(total + 60);
          case "hour-down":
            return this._change(total - 60);
          case "minute-up": // wrap within the hour, snapping to the step
            return this._change(h * 60 + ((Math.floor(m / step) + 1) * step) % 60);
          case "minute-down":
            return this._change(h * 60 + ((Math.ceil(m / step) - 1) * step + 60) % 60);
        }
      })
    );
    this._refs.ampm.addEventListener("click", () => this._change(this._minutes() + 12 * 60));

    // Typing: tap selects the value, the number keypad opens, Enter or leaving saves.
    for (const input of [this._refs.hour, this._refs.minute]) {
      input.addEventListener("focus", () => input.select());
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 2);
        if (input === this._refs.hour && input.value.length === 2) this._refs.minute.focus();
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") input.blur();
        if (ev.key === "Escape") {
          input.dataset.cancel = "1";
          input.blur();
        }
      });
      input.addEventListener("blur", () => {
        const cancelled = input.dataset.cancel;
        delete input.dataset.cancel;
        if (!cancelled) this._typed(input);
        this._render();
      });
    }
  }

  _typed(input) {
    const n = parseInt(input.value, 10);
    if (Number.isNaN(n)) return;
    const total = this._minutes();
    const h24 = Math.floor(total / 60);
    const m = total % 60;
    if (input === this._refs.minute) {
      if (n <= 59 && n !== m) this._change(h24 * 60 + n);
      return;
    }
    let hour;
    if (this._is12h()) {
      if (n < 1 || n > 12) return;
      hour = (n % 12) + (h24 >= 12 ? 12 : 0); // keep the current AM/PM
    } else {
      if (n > 23) return;
      hour = n;
    }
    if (hour !== h24) this._change(hour * 60 + m);
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this.shadowRoot) this._build();
    const r = this._refs;
    const st = this._hass.states[this._config.entity];

    const size = this._config.font_size;
    const css = size === undefined || size === "" ? "" : /^\d+(\.\d+)?$/.test(String(size)) ? `${size}px` : String(size);
    if (this.style.getPropertyValue("--hvac-time-size") !== css) this.style.setProperty("--hvac-time-size", css);

    r.warning.hidden = !!st;
    r.picker.hidden = !st;
    if (!st) {
      r.name.hidden = true;
      r.warning.textContent = `Entity not found: ${this._config.entity}`;
      return;
    }

    r.name.hidden = !!this._config.hide_name;
    r.name.textContent = this._config.name || st.attributes.friendly_name || this._config.entity;

    const total = this._minutes();
    const h24 = Math.floor(total / 60);
    const twelve = this._is12h();
    // Don't overwrite what the user is typing.
    const focused = this.shadowRoot.activeElement;
    if (focused !== r.hour) r.hour.value = twelve ? String(h24 % 12 || 12) : pad(h24);
    if (focused !== r.minute) r.minute.value = pad(total % 60);
    r.ampm.hidden = !twelve;
    r.ampm.textContent = h24 < 12 ? "AM" : "PM";
    r.picker.classList.toggle("pending", !!this._pending);
  }
}

if (!customElements.get(CARD)) {
  customElements.define(CARD, HvacSchedulerTimeCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD,
    name: "HVAC Scheduler Time",
    description: "Pick the time for an HVAC Scheduler schedule.",
  });
}
