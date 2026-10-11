/*
 * HVAC Scheduler slider card: a Bubble Card style slider for a schedule setpoint.
 * Served by the hvac_scheduler integration and loaded on every dashboard automatically.
 *
 *   type: custom:hvac-scheduler-slider-card
 *   entity: sensor.morning
 *   attribute: cool_setpoint   # or heat_setpoint
 *   name: Cool                 # optional
 *   icon: mdi:snowflake        # optional
 *   min: 60                    # optional
 *   max: 85                    # optional
 *   step: 1                    # optional, whole numbers
 *   color: "#2b9af9"           # optional, fill color
 */

const DOMAIN = "hvac_scheduler";
const SERVICE = "update_schedule";
const CARD = "hvac-scheduler-slider-card";
const KEY_SAVE_DELAY_MS = 800;
const PENDING_TTL_MS = 5000;

const ATTRIBUTES = {
  cool_setpoint: { name: "Cool", icon: "mdi:snowflake", color: "var(--state-climate-cool-color, #2b9af9)" },
  heat_setpoint: { name: "Heat", icon: "mdi:fire", color: "var(--state-climate-heat-color, #ff8100)" },
};

const STYLE = `
  :host { display: block; }
  ha-card {
    position: relative; overflow: hidden; height: 56px; box-sizing: border-box;
    border-radius: var(--bubble-border-radius, 32px);
    background: var(--bubble-main-background-color, var(--card-background-color));
    cursor: pointer; user-select: none; -webkit-user-select: none;
    touch-action: pan-y; -webkit-tap-highlight-color: transparent;
  }
  ha-card:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .fill {
    position: absolute; inset: 0 auto 0 0; width: 0;
    background: var(--hvac-slider-color); opacity: 0.55;
    transition: width 0.2s ease;
  }
  .dragging .fill { transition: none; opacity: 0.75; }
  .content { position: relative; height: 100%; display: flex; align-items: center; gap: 10px; padding: 0 18px 0 8px; pointer-events: none; }
  .icon {
    flex: none; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: var(--bubble-icon-background-color, var(--secondary-background-color)); color: var(--primary-text-color);
  }
  .name { flex: 1; min-width: 0; font-weight: 600; font-size: 0.95rem; color: var(--primary-text-color);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value { font-weight: 600; font-size: 1rem; font-variant-numeric: tabular-nums; color: var(--primary-text-color); }
  .warning { color: var(--error-color); }
`;

class HvacSchedulerSliderCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("Choose a schedule entity");
    const attribute = config.attribute || "cool_setpoint";
    if (!ATTRIBUTES[attribute]) throw new Error("attribute must be cool_setpoint or heat_setpoint");
    this._config = { ...config, attribute };
    this._pending = null; // { value, expires }
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  static getStubConfig(hass) {
    const first = Object.values(hass.entities || {}).find((e) => e.platform === DOMAIN);
    return { entity: first ? first.entity_id : "", attribute: "cool_setpoint" };
  }

  // Visual editor (Home Assistant 2024.12+).
  static getConfigForm() {
    const labels = {
      entity: "Schedule",
      attribute: "Setpoint",
      name: "Name",
      icon: "Icon",
      min: "Minimum",
      max: "Maximum",
      step: "Step",
      color: "Fill color (CSS)",
    };
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { filter: { integration: DOMAIN } } } },
        {
          name: "attribute",
          required: true,
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "cool_setpoint", label: "Cool setpoint" },
                { value: "heat_setpoint", label: "Heat setpoint" },
              ],
            },
          },
        },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "name", selector: { text: {} } },
            { name: "icon", selector: { icon: {} } },
            { name: "min", selector: { number: { mode: "box" } } },
            { name: "max", selector: { number: { mode: "box" } } },
            { name: "step", selector: { number: { min: 1, max: 10, mode: "box" } } },
            { name: "color", selector: { text: {} } },
          ],
        },
      ],
      computeLabel: (s) => labels[s.name],
    };
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 6, rows: 1, min_columns: 3, min_rows: 1, max_rows: 1 };
  }

  _celsius() {
    const unit = this._hass.config.unit_system && this._hass.config.unit_system.temperature;
    return unit === "°C";
  }

  _range() {
    const c = this._celsius();
    const min = Number(this._config.min ?? (c ? 10 : 50));
    const max = Number(this._config.max ?? (c ? 32 : 90));
    const step = Math.max(1, Math.round(Number(this._config.step) || 1));
    return { min, max: Math.max(max, min + step), step };
  }

  // Current value from HA, or the value the user is setting.
  _value() {
    const st = this._hass.states[this._config.entity];
    const actual = st ? Number(st.attributes[this._config.attribute]) : NaN;
    if (this._dragValue !== undefined) return this._dragValue;
    if (this._pending) {
      const waiting = this._keyTimer || Date.now() < this._pending.expires;
      if (this._pending.value !== actual && waiting) return this._pending.value;
      this._pending = null;
    }
    return actual;
  }

  _clamp(v) {
    const { min, max, step } = this._range();
    v = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, v));
  }

  _fromPointer(ev) {
    const rect = this._refs.card.getBoundingClientRect();
    const { min, max } = this._range();
    const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    return this._clamp(min + ratio * (max - min));
  }

  _save(value) {
    const st = this._hass.states[this._config.entity];
    if (st && Number(st.attributes[this._config.attribute]) === value) return;
    this._pending = { value, expires: Date.now() + PENDING_TTL_MS };
    this._render();
    this._hass
      .callService(DOMAIN, SERVICE, { entity_id: this._config.entity, [this._config.attribute]: value })
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
  }

  _build() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card tabindex="0" role="slider">
        <div class="fill"></div>
        <div class="content">
          <div class="icon"><ha-icon></ha-icon></div>
          <div class="name"></div>
          <div class="value"></div>
        </div>
      </ha-card>`;
    const root = this.shadowRoot;
    const card = root.querySelector("ha-card");
    this._refs = {
      card,
      fill: root.querySelector(".fill"),
      icon: root.querySelector("ha-icon"),
      name: root.querySelector(".name"),
      value: root.querySelector(".value"),
    };

    // Drag anywhere on the card; save once on release. Vertical swipes still scroll the page.
    card.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || !this._hass.states[this._config.entity]) return;
      card.setPointerCapture(ev.pointerId);
      this._dragValue = this._fromPointer(ev);
      card.classList.add("dragging");
      this._render();
    });
    card.addEventListener("pointermove", (ev) => {
      if (this._dragValue === undefined) return;
      this._dragValue = this._fromPointer(ev);
      this._render();
    });
    const end = (save) => {
      if (this._dragValue === undefined) return;
      const value = this._dragValue;
      this._dragValue = undefined;
      card.classList.remove("dragging");
      if (save) this._save(value);
      this._render();
    };
    card.addEventListener("pointerup", () => end(true));
    card.addEventListener("pointercancel", () => end(false));

    card.addEventListener("keydown", (ev) => {
      const { min, max, step } = this._range();
      const deltas = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
      let next;
      if (ev.key in deltas) next = this._clamp(this._value() + deltas[ev.key]);
      else if (ev.key === "Home") next = min;
      else if (ev.key === "End") next = max;
      else return;
      ev.preventDefault();
      this._pending = { value: next, expires: Date.now() + KEY_SAVE_DELAY_MS + PENDING_TTL_MS };
      this._render();
      clearTimeout(this._keyTimer);
      this._keyTimer = setTimeout(() => {
        this._keyTimer = null;
        this._save(next);
      }, KEY_SAVE_DELAY_MS);
    });
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this.shadowRoot) this._build();
    const r = this._refs;
    const defaults = ATTRIBUTES[this._config.attribute];
    const st = this._hass.states[this._config.entity];

    this.style.setProperty("--hvac-slider-color", this._config.color || defaults.color);
    r.icon.icon = this._config.icon || defaults.icon;
    r.name.textContent = this._config.name || (st && st.attributes.friendly_name ? `${st.attributes.friendly_name} ${defaults.name.toLowerCase()}` : defaults.name);

    if (!st) {
      r.fill.style.width = "0";
      r.value.innerHTML = `<span class="warning">Entity not found</span>`;
      return;
    }

    const { min, max } = this._range();
    const value = this._value();
    const unit = (this._hass.config.unit_system && this._hass.config.unit_system.temperature) || "°";
    const ratio = Number.isFinite(value) ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
    r.fill.style.width = `${ratio * 100}%`;
    r.value.textContent = Number.isFinite(value) ? `${value} ${unit}` : "—";
    r.card.setAttribute("aria-label", r.name.textContent);
    r.card.setAttribute("aria-valuemin", min);
    r.card.setAttribute("aria-valuemax", max);
    if (Number.isFinite(value)) r.card.setAttribute("aria-valuenow", value);
  }
}

if (!customElements.get(CARD)) {
  customElements.define(CARD, HvacSchedulerSliderCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD,
    name: "HVAC Scheduler Slider",
    description: "Bubble-style slider for a schedule's cool or heat setpoint.",
  });
}
