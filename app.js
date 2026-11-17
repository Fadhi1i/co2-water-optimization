"use strict";

(() => {
  const DATA = window.RESULTS;
  const META = window.RESULTS_METADATA;

  if (!DATA || !META) {
    console.error("Load data.js before app.js.");
    return;
  }

  const $ = (id) => document.getElementById(id);

  const SPEEDS = [...META.speeds];
  const FLOWS = [...META.flowSettings];

  const state = {
    speed: 20,
    flow: 10,
    uptakeTarget: null,
    lastCalculation: null
  };

  const SPEED_STYLES = {
    20: {
      color: "var(--c20)",
      shape: "diamond",
      dash: ""
    },
    30: {
      color: "var(--c30)",
      shape: "circle",
      dash: ""
    },
    40: {
      color: "var(--c40)",
      shape: "triangle",
      dash: "7 3"
    },
    50: {
      color: "var(--c50)",
      shape: "square",
      dash: "2 4"
    }
  };

  let chartFrame = null;

  /* =====================================================
     NUMBER AND DATA HELPERS
  ===================================================== */

  function format(value, decimals = 3) {
    if (!Number.isFinite(value)) return "Not available";

    const absolute = Math.abs(value);

    if (
      absolute >= 1000000 ||
      (absolute > 0 && absolute < 10 ** -decimals)
    ) {
      return value.toExponential(2);
    }

    return value.toLocaleString("en-GB", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function signed(value, decimals = 3) {
    if (!Number.isFinite(value)) return "Not available";

    return `${value > 0 ? "+" : ""}${format(value, decimals)}`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function mean(values) {
    if (!values.length) return undefined;

    return values.reduce((sum, value) => sum + value, 0) /
      values.length;
  }

  function sampleSD(values) {
    if (values.length < 2) return undefined;

    const average = mean(values);

    return Math.sqrt(
      values.reduce(
        (sum, value) => sum + (value - average) ** 2,
        0
      ) /
      (values.length - 1)
    );
  }

  function getResult(speed, flow) {
    return DATA[Number(speed)]?.find(
      (result) => result.flow === Number(flow)
    );
  }

  function selectedResult() {
    return getResult(state.speed, state.flow);
  }

  function selectedLabel() {
    return `${state.speed} Hz / ${state.flow} L/min`;
  }

  function assumptionNote(speed) {
    return Number(speed) === 30
      ? (
          "30 Hz dissolved masses and efficiencies use " +
          "an assumed 8 kg water collection."
        )
      : "";
  }

  function motionBehaviour() {
    return window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
      ? "auto"
      : "smooth";
  }

  function scrollToElement(element, focus = false) {
    if (!element) return;

    if (focus) {
      element.focus({ preventScroll: true });
    }

    element.scrollIntoView({
      behavior: motionBehaviour(),
      block: "center"
    });
  }

  function isVisible(element) {
    const bounds = element.getBoundingClientRect();

    const headerBottom =
      document.querySelector(".site-header")
        ?.getBoundingClientRect().bottom ?? 0;

    const floatingHeight = $("calculate-bar").hidden
      ? 0
      : $("calculate-bar").getBoundingClientRect().height;

    return (
      bounds.top >= headerBottom + 12 &&
      bounds.bottom <=
        window.innerHeight - floatingHeight - 12
    );
  }

  /* =====================================================
     SPEED AND GAS-FLOW SELECTION
  ===================================================== */

  function createControls() {
    $("speeds").replaceChildren();
    $("flows").replaceChildren();

    for (const speed of SPEEDS) {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = `${speed} Hz`;
      button.dataset.speed = speed;
      button.setAttribute("aria-pressed", "false");

      button.addEventListener("click", () => {
        chooseCondition(speed, state.flow);
      });

      $("speeds").append(button);
    }

    for (const flow of FLOWS) {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = `${flow} L/min`;
      button.dataset.flow = flow;
      button.setAttribute("aria-pressed", "false");

      button.addEventListener("click", () => {
        chooseCondition(state.speed, flow);
      });

      $("flows").append(button);
    }

    for (const id of ["a", "b"]) {
      const select = $(id);
      select.replaceChildren();

      for (const speed of SPEEDS) {
        const group = document.createElement("optgroup");
        group.label = `${speed} Hz`;

        for (const result of DATA[speed]) {
          const option = document.createElement("option");

          option.value = `${speed},${result.flow}`;
          option.textContent =
            `${speed} Hz / ${result.flow} L/min`;

          group.append(option);
        }

        select.append(group);
      }
    }

    $("a").value = "20,15";
    $("b").value = "40,17";
  }

  function chooseCondition(speed, flow) {
    const nextSpeed = Number(speed);
    const nextFlow = Number(flow);

    if (!getResult(nextSpeed, nextFlow)) return;

    const changed =
      state.speed !== nextSpeed ||
      state.flow !== nextFlow;

    state.speed = nextSpeed;
    state.flow = nextFlow;

    hideTooltip();
    updateSelection();

    /*
     * Changing the selected experimental condition does not
     * silently recalculate an existing batch-dose result.
     */
    if (changed) {
      markDoseDirty();
    }
  }

  function updateControls() {
    document.querySelectorAll("[data-speed]").forEach((button) => {
      const active =
        Number(button.dataset.speed) === state.speed;

      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    document.querySelectorAll("[data-flow]").forEach((button) => {
      const active =
        Number(button.dataset.flow) === state.flow;

      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const hasTotal = DATA[state.speed].some(
      (result) => Number.isFinite(result.totalCo2)
    );

    $("show-total").disabled = !hasTotal;

    document.querySelectorAll(".total-series").forEach((item) => {
      item.hidden = !($("show-total").checked && hasTotal);
    });
  }

  /* =====================================================
     SELECTED RESULTS
  ===================================================== */

  function setMetricStatus(id, text, status) {
    const element = $(id);

    element.textContent = text;
    element.dataset.status = status;
  }

  function updateMetrics() {
    const result = selectedResult();

    $("uptake").textContent =
      `${format(result.uptake, 4)} g/L`;

    $("efficiency").textContent =
      `${format(result.efficiency, 2)}%`;

    $("condition").textContent = selectedLabel();

    $("repeatcount").textContent =
      `${result.repeats.length} individual trials`;

    $("selection-source").textContent =
      `${META.sources[state.speed]}. ` +
      "Setting values are arithmetic means of individual trials.";

    $("efficiency-basis").textContent = result.waterMassAssumed
      ? (
          "Uses the assumed 8 kg water collection to calculate " +
          "dissolved mass, divided by cylinder mass loss."
        )
      : (
          "Uses independently weighed water to calculate dissolved " +
          "mass, divided by cylinder mass loss."
        );

    updateUptakeStatus(result);
    updateWaterMetric(result);
    updateConditionInsight(result);

    $("pointdetail").textContent =
      `Selected condition: ${selectedLabel()}. ` +
      `Uptake range ${format(result.uptakeMin, 4)} to ` +
      `${format(result.uptakeMax, 4)} g/L. ` +
      `Efficiency range ${format(result.efficiencyMin, 2)} to ` +
      `${format(result.efficiencyMax, 2)}%. ` +
      assumptionNote(state.speed);

    $("doseselection").textContent =
      `Selected: ${selectedLabel()} · ` +
      `${format(result.uptake, 4)} g/L added uptake`;

    updateChartNote();
  }

  function updateUptakeStatus(result) {
    if (state.uptakeTarget === null) {
      setMetricStatus("uptake-status", "", "neutral");
      return;
    }

    const meetsTarget = result.uptake >= state.uptakeTarget;

    setMetricStatus(
      "uptake-status",
      meetsTarget
        ? `Meets ${format(state.uptakeTarget, 3)} g/L target`
        : `Below ${format(state.uptakeTarget, 3)} g/L target`,
      meetsTarget ? "meets" : "below"
    );
  }

  function updateWaterMetric(result) {
    $("waterdelivery").textContent =
      `${format(result.waterKg, 2)} kg`;

    if (result.waterMassAssumed) {
      $("water-metric-label").textContent =
        "Assumed water per collection";

      $("waterdetail").textContent =
        "8 kg assumed for the 30 Hz calculations. " +
        "Collected mass was not independently recorded.";

      setMetricStatus(
        "water-status",
        "Delivery accuracy not verified",
        "neutral"
      );

      return;
    }

    $("water-metric-label").textContent =
      "Actual water collected";

    $("waterdetail").textContent =
      `Independently weighed, against a ` +
      `${format(result.waterSetpoint, 2)} kg setpoint.`;

    const deviation = result.waterDeviationPercent;

    if (!Number.isFinite(deviation)) {
      setMetricStatus("water-status", "", "neutral");
      return;
    }

    setMetricStatus(
      "water-status",
      deviation === 0
        ? "Matches the setpoint"
        : (
            `${format(Math.abs(deviation), 1)}% ` +
            `${deviation < 0 ? "below" : "above"} setpoint`
          ),
      deviation < 0 ? "shortfall" : "neutral"
    );
  }

  function updateConditionInsight(result) {
    const points = DATA[state.speed];

    const mostEfficient = points.reduce((best, point) =>
      point.efficiency > best.efficiency ? point : best
    );

    const highestUptake = points.reduce((best, point) =>
      point.uptake > best.uptake ? point : best
    );

    const sentences = [];

    if (result.flow === mostEfficient.flow) {
      sentences.push(
        `This setting has the highest mean dissolution ` +
        `efficiency at ${state.speed} Hz.`
      );
    } else if (result.flow === highestUptake.flow) {
      sentences.push(
        `This setting has the highest mean uptake ` +
        `concentration at ${state.speed} Hz.`
      );
    } else {
      sentences.push(
        `At ${state.speed} Hz, highest mean efficiency occurs ` +
        `at ${mostEfficient.flow} L/min and highest mean ` +
        `concentration at ${highestUptake.flow} L/min.`
      );
    }

    if (result.waterMassAssumed) {
      sentences.push(
        "Water mass is assumed at 8 kg per collection; " +
        "dissolved masses and efficiencies depend on that assumption."
      );

      $("condition-insight").dataset.status = "neutral";
    } else {
      sentences.push(
        `Average weighed water collection is ` +
        `${format(result.waterKg, 2)} kg against the ` +
        `${format(result.waterSetpoint, 2)} kg setpoint.`
      );

      $("condition-insight").dataset.status =
        result.waterDeviationPercent < 0
          ? "attention"
          : "neutral";
    }

    $("condition-insight").textContent = sentences.join(" ");
  }

  function updateChartNote() {
    const notes = [
      "Select a chart point to inspect that condition.",
      "Lines connect tested means."
    ];

    if ($("errors").checked) {
      notes.push(
        "Bars show ±1 sample standard deviation. " +
        "Assumed 30 Hz water masses have no measured spread."
      );
    }

    if ($("show-repeats").checked) {
      notes.push(
        "Faint marks show individual recorded trial values. " +
        "They are not shown as measured water trials at 30 Hz."
      );
    }

    if ($("show-total").checked) {
      notes.push(
        "The additional dashed series shows total dissolved " +
        "carbon as CO₂ equivalent for the selected speed."
      );
    }

    if (state.uptakeTarget !== null) {
      notes.push(
        `Applied uptake target: ` +
        `${format(state.uptakeTarget, 3)} g/L.`
      );
    }

    if ($("overlay").checked || state.speed === 30) {
      notes.push(assumptionNote(30));
    }

    $("chart-note").textContent = notes.join(" ");
  }

  /* =====================================================
     INDIVIDUAL TRIAL TABLE
  ===================================================== */

  function updateRepeats() {
    const result = selectedResult();

    const columns = [
      { key: "time", label: "Time", text: true },
      {
        key: "uptake",
        label: "Added uptake (g/L)",
        decimals: 4
      },
      {
        key: "totalCo2",
        label: "Total carbon (g/L as CO₂)",
        decimals: 4
      },
      {
        key: "efficiency",
        label: "Efficiency (%)",
        decimals: 2
      },
      {
        key: "waterKg",
        label: result.waterMassAssumed
          ? "Assumed water (kg)"
          : "Weighed water (kg)",
        decimals: 2
      },
      {
        key: "waterSetpoint",
        label: "Water setpoint (kg)",
        decimals: 2
      },
      {
        key: "co2Grams",
        label: "CO₂ supplied (g)",
        decimals: 1
      },
      {
        key: "uptakeGrams",
        label: result.waterMassAssumed
          ? "Added CO₂ dissolved (g, assumed volume)"
          : "Added CO₂ dissolved (g)",
        decimals: 3
      },
      {
        key: "waterFlow1",
        label: "Point 1 (L/min)",
        decimals: 2
      },
      {
        key: "waterFlow2",
        label: "Point 2 (L/min)",
        decimals: 2
      },
      {
        key: "inletPh",
        label: "Handheld inlet pH",
        decimals: 2
      },
      {
        key: "outletPh",
        label: "Handheld outlet pH",
        decimals: 2
      },
      {
        key: "inletTemp",
        label: "Inlet temperature (°C)",
        decimals: 1
      },
      {
        key: "outletTemp",
        label: "Outlet temperature (°C)",
        decimals: 1
      },
      {
        key: "pressure",
        label: "Recorded pressure (bar)",
        decimals: 1
      },
      {
        key: "systemPh",
        label: "System pH",
        decimals: 2
      },
      {
        key: "systemDco2Reading",
        label: "System dCO₂ display (units unconfirmed)",
        decimals: 1
      },
      {
        key: "cylinderBefore",
        label: "Cylinder before (kg)",
        decimals: 3
      },
      {
        key: "cylinderAfter",
        label: "Cylinder after (kg)",
        decimals: 3
      }
    ].filter((column) =>
      result.repeats.some((repeat) =>
        column.text
          ? Boolean(repeat[column.key])
          : Number.isFinite(repeat[column.key])
      )
    );

    const headings = columns.map((column) =>
      `<th scope="col">${escapeHTML(column.label)}</th>`
    ).join("");

    const rows = result.repeats.map((repeat, index) => {
      const cells = columns.map((column) => {
        const value = column.text
          ? (repeat[column.key] ?? "Not recorded")
          : format(repeat[column.key], column.decimals);

        return `<td>${escapeHTML(value)}</td>`;
      }).join("");

      return `
        <tr>
          <th scope="row">${index + 1}</th>
          ${cells}
        </tr>
      `;
    }).join("");

    const waterNote = result.waterMassAssumed
      ? (
          "Water mass is assumed at 8 kg per collection. " +
          "Dissolved masses and efficiencies use this assumed volume."
        )
      : (
          "Water mass was independently weighed. " +
          "Dissolved masses use approximately 1 kg/L."
        );

    $("repeats").innerHTML = `
      <div class="table-wrap">
        <table>
          <caption>
            ${escapeHTML(selectedLabel())}:
            ${result.repeats.length} individual trials
          </caption>

          <thead>
            <tr>
              <th scope="col">Trial</th>
              ${headings}
            </tr>
          </thead>

          <tbody>${rows}</tbody>
        </table>
      </div>

      <p class="note">
        ${escapeHTML(waterNote)}
        Recorded pressure reference and location are not
        confirmed here. Times are reading timestamps,
        not collection durations.
      </p>
    `;
  }

  /* =====================================================
     SVG CHART HELPERS
  ===================================================== */

  function svgElement(tag, attributes = {}, text) {
    const element = document.createElementNS(
      "http://www.w3.org/2000/svg",
      tag
    );

    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function createMarker(shape, x, y, size, color, hollow = false) {
    const attributes = {
      fill: hollow ? "var(--paper)" : color,
      stroke: color,
      "stroke-width": hollow ? 1.8 : 0
    };

    if (shape === "diamond") {
      return svgElement("path", {
        ...attributes,
        d:
          `M${x},${y - size} ` +
          `L${x + size},${y} ` +
          `L${x},${y + size} ` +
          `L${x - size},${y}Z`
      });
    }

    if (shape === "triangle") {
      return svgElement("path", {
        ...attributes,
        d:
          `M${x},${y - size} ` +
          `L${x + size},${y + size} ` +
          `L${x - size},${y + size}Z`
      });
    }

    if (shape === "square") {
      return svgElement("rect", {
        ...attributes,
        x: x - size,
        y: y - size,
        width: size * 2,
        height: size * 2
      });
    }

    return svgElement("circle", {
      ...attributes,
      cx: x,
      cy: y,
      r: size
    });
  }

  function makeSeries(speed, key, options = {}) {
    const style = SPEED_STYLES[speed];

    const assumedWaterSeries =
      speed === 30 && key === "waterKg";

    const assumedDissolvedMass =
      speed === 30 && key === "uptakeGrams";

    const points = DATA[speed]
      .filter((result) => Number.isFinite(result[key]))
      .map((result) => {
        const readings = assumedWaterSeries
          ? []
          : result.repeats
              .map((repeat) => repeat[key])
              .filter(Number.isFinite);

        return {
          flow: result.flow,
          value: result[key],
          sd: assumedWaterSeries
            ? undefined
            : sampleSD(readings),
          readings
        };
      });

    return {
      speed,
      key,
      label: options.label ?? `${speed} Hz`,
      color: options.color ?? style.color,
      shape: options.shape ?? style.shape,
      dash: options.dash ?? style.dash,
      hollow: options.hollow ?? false,
      decimals: options.decimals ?? 3,

      note: options.note ?? (
        assumedWaterSeries
          ? "Assumed value; not independently weighed."
          : assumedDissolvedMass || (
              speed === 30 && key === "efficiency"
            )
            ? "Calculated using the assumed 8 kg water collection."
            : ""
      ),

      points
    };
  }

  function hideTooltip() {
    $("tooltip").hidden = true;
  }

  function showTooltip(
    anchor,
    series,
    point,
    unit,
    position = null
  ) {
    const tooltip = $("tooltip");

    const heading = document.createElement("strong");
    heading.textContent =
      `${series.label} / ${point.flow} L/min`;

    const value = document.createElement("div");
    value.textContent =
      `Setting value: ${format(point.value, series.decimals)} ${unit}`;

    tooltip.replaceChildren(heading, value);

    if (Number.isFinite(point.sd)) {
      const spread = document.createElement("div");

      spread.textContent =
        `Sample SD: ${format(point.sd, series.decimals)} ${unit}`;

      tooltip.append(spread);
    }

    if (series.note) {
      const note = document.createElement("div");
      note.textContent = series.note;
      tooltip.append(note);
    }

    tooltip.hidden = false;

    const bounds = anchor.getBoundingClientRect();

    const clientX = position?.x ??
      bounds.left + bounds.width / 2;

    const clientY = position?.y ?? bounds.top;

    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - tooltip.offsetWidth - 8,
        clientX + 12
      )
    );

    const preferredTop =
      clientY - tooltip.offsetHeight - 12;

    const top = preferredTop >= 8
      ? preferredTop
      : clientY + 12;

    tooltip.style.left = `${left}px`;

    tooltip.style.top = `${Math.max(
      8,
      Math.min(
        window.innerHeight - tooltip.offsetHeight - 8,
        top
      )
    )}px`;
  }

  function emptyChart(id, description) {
    const host = $(id);

    const box = document.createElement("div");
    box.className = "chart-empty";

    const heading = document.createElement("strong");
    heading.textContent = "Measurements not available";

    const paragraph = document.createElement("p");
    paragraph.textContent = description;

    box.append(heading, paragraph);
    host.replaceChildren(box);
  }

  function tickFormat(value, maximum) {
    if (value === 0) return "0";

    if (maximum >= 1000000 || maximum < 0.001) {
      return value.toExponential(1);
    }

    const decimals =
      maximum <= 1 ? 2 :
      maximum <= 10 ? 1 :
      0;

    return value.toLocaleString("en-GB", {
      maximumFractionDigits: decimals
    });
  }

  function drawChart(id, suppliedSeries, options) {
    const host = $(id);

    const series = suppliedSeries.filter(
      (item) => item.points.length
    );

    if (!series.length) {
      emptyChart(
        id,
        "This dataset does not include these measurements."
      );
      return;
    }

    const width = Math.floor(
      host.getBoundingClientRect().width
    );

    if (width <= 0) return;

    const height = 300;

    const margin = {
      left: 67,
      right: 17,
      top: 24,
      bottom: 58
    };

    const right = width - margin.right;
    const bottom = height - margin.bottom;

    const showErrors = $("errors").checked;
    const showTrials = $("show-repeats").checked;

    const values = [];

    for (const item of series) {
      for (const point of item.points) {
        values.push(point.value);

        if (showErrors && Number.isFinite(point.sd)) {
          values.push(point.value + point.sd);
        }

        if (showTrials) {
          values.push(...point.readings);
        }
      }
    }

    const reference = Number.isFinite(options.reference)
      ? options.reference
      : null;

    if (reference !== null) {
      values.push(reference);
    }

    const maximum = Math.max(...values, 0);
    const paddedMaximum = maximum * 1.15;

    const yMaximum = maximum === 0
      ? 1
      : (
          Number.isFinite(paddedMaximum)
            ? paddedMaximum
            : maximum
        );

    const minimumFlow = Math.min(...FLOWS);
    const maximumFlow = Math.max(...FLOWS);

    const x = (flow) =>
      margin.left +
      (
        (flow - minimumFlow + 1) /
        (maximumFlow - minimumFlow + 2)
      ) *
      (right - margin.left);

    const y = (value) =>
      bottom -
      (value / yMaximum) * (bottom - margin.top);

    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label":
        `${options.title}. ` +
        "Horizontal axis: CO₂ flowmeter setting in litres per minute. " +
        `Vertical axis: ${options.axisLabel}.`
    });

    svg.append(
      svgElement("title", {}, options.title),
      svgElement(
        "desc",
        {},
        "Lines connect setting means or explicitly labelled " +
        "assumed values. Optional faint marks show individual " +
        "trials. Bars show one sample standard deviation, " +
        "except for assumed water mass."
      )
    );

    const clipId = `clip-${id}`;
    const definitions = svgElement("defs");
    const clip = svgElement("clipPath", { id: clipId });

    clip.append(svgElement("rect", {
      x: margin.left,
      y: margin.top,
      width: right - margin.left,
      height: bottom - margin.top
    }));

    definitions.append(clip);
    svg.append(definitions);

    for (let index = 0; index <= 4; index++) {
      const value = yMaximum * (index / 4);
      const position = y(value);

      svg.append(
        svgElement("line", {
          class: "grid-line",
          x1: margin.left,
          x2: right,
          y1: position,
          y2: position
        }),
        svgElement(
          "text",
          {
            x: margin.left - 9,
            y: position + 4,
            "text-anchor": "end"
          },
          tickFormat(value, yMaximum)
        )
      );
    }

    svg.append(svgElement("path", {
      class: "axis-line",
      d:
        `M${margin.left},${margin.top}` +
        `V${bottom}H${right}`,
      fill: "none"
    }));

    const xTicks = width < 370
      ? [5, 10, 20, 25]
      : FLOWS;

    for (const flow of xTicks) {
      svg.append(svgElement(
        "text",
        {
          x: x(flow),
          y: bottom + 22,
          "text-anchor": "middle"
        },
        flow
      ));
    }

    svg.append(
      svgElement(
        "text",
        {
          class: "axis-title",
          x: (margin.left + right) / 2,
          y: height - 10,
          "text-anchor": "middle"
        },
        "CO₂ setting (L/min)"
      ),
      svgElement(
        "text",
        {
          class: "axis-title",
          transform:
            `translate(16 ${(margin.top + bottom) / 2}) rotate(-90)`,
          "text-anchor": "middle"
        },
        options.axisLabel
      )
    );

    const plot = svgElement("g", {
      "clip-path": `url(#${clipId})`
    });

    svg.append(plot);

    if (reference !== null) {
      plot.append(svgElement("line", {
        x1: margin.left,
        x2: right,
        y1: y(reference),
        y2: y(reference),
        stroke: options.referenceColor ?? "var(--amber)",
        "stroke-width": 1.4,
        "stroke-dasharray": "6 4"
      }));

      svg.append(svgElement(
        "text",
        {
          x: right - 5,
          y: Math.max(margin.top + 12, y(reference) - 8),
          "text-anchor": "end"
        },
        options.referenceLabel ??
          `${format(reference, 2)} ${options.unit}`
      ));
    }

    const orderedSeries = [
      ...series.filter((item) => item.speed !== state.speed),
      ...series.filter((item) => item.speed === state.speed)
    ];

    const interactivePoints = [];

    for (const item of orderedSeries) {
      const path = item.points.map((point, index) =>
        `${index === 0 ? "M" : "L"}` +
        `${x(point.flow)},${y(point.value)}`
      ).join(" ");

      plot.append(svgElement("path", {
        d: path,
        fill: "none",
        stroke: item.color,
        "stroke-width": item.speed === state.speed ? 2.7 : 1.8,
        "stroke-dasharray": item.dash,
        opacity: item.speed === state.speed ? 1 : 0.72
      }));

      for (const point of item.points) {
        const pointX = x(point.flow);
        const pointY = y(point.value);

        if (showErrors && Number.isFinite(point.sd)) {
          const upper = y(point.value + point.sd);
          const lower = y(Math.max(0, point.value - point.sd));

          plot.append(svgElement("path", {
            d:
              `M${pointX},${upper}V${lower} ` +
              `M${pointX - 4},${upper}H${pointX + 4} ` +
              `M${pointX - 4},${lower}H${pointX + 4}`,
            fill: "none",
            stroke: item.color,
            "stroke-width": 1.2,
            opacity: 0.8
          }));
        }

        if (showTrials) {
          for (const reading of point.readings) {
            const marker = createMarker(
              item.shape,
              pointX,
              y(reading),
              3,
              item.color,
              item.hollow
            );

            marker.setAttribute("opacity", "0.35");
            plot.append(marker);
          }
        }

        if (
          item.speed === state.speed &&
          point.flow === state.flow
        ) {
          plot.append(svgElement("circle", {
            cx: pointX,
            cy: pointY,
            r: 9,
            fill: "none",
            stroke: item.color,
            "stroke-width": 1.5
          }));
        }

        plot.append(createMarker(
          item.shape,
          pointX,
          pointY,
          4.5,
          item.color,
          item.hollow
        ));

        interactivePoints.push({
          item,
          point,
          x: pointX,
          y: pointY
        });
      }
    }

    /*
     * Keyboard-accessible point targets.
     */
    for (const entry of interactivePoints) {
      const { item, point } = entry;

      const hit = svgElement("circle", {
        cx: entry.x,
        cy: entry.y,
        r: 15,
        fill: "transparent",
        tabindex: "0",
        role: "button",
        "aria-label":
          `${item.label}, ${point.flow} L/min: ` +
          `${format(point.value, item.decimals)} ${options.unit}. ` +
          `${item.note} Select this condition.`,
        "data-condition": `${item.speed},${point.flow}`,
        "data-series": item.key
      });

      hit.addEventListener("focus", () => {
        showTooltip(hit, item, point, options.unit);
      });

      hit.addEventListener("blur", hideTooltip);

      hit.addEventListener("click", () => {
        chooseCondition(item.speed, point.flow);
      });

      hit.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();

        chooseCondition(item.speed, point.flow);

        const replacement = $(id).querySelector(
          `[data-condition="${item.speed},${point.flow}"]` +
          `[data-series="${item.key}"]`
        );

        replacement?.focus({ preventScroll: true });
      });

      svg.append(hit);
    }

    /*
     * Pointer interaction uses the nearest visible mean.
     * This avoids overlapping invisible point targets
     * selecting a more distant series.
     */
    const pointerLayer = svgElement("rect", {
      x: margin.left,
      y: margin.top,
      width: right - margin.left,
      height: bottom - margin.top,
      fill: "transparent",
      "aria-hidden": "true"
    });

    function nearestPoint(event) {
      const bounds = svg.getBoundingClientRect();

      const pointerX =
        (event.clientX - bounds.left) * width / bounds.width;

      const pointerY =
        (event.clientY - bounds.top) * height / bounds.height;

      const radius = event.pointerType === "touch" ? 44 : 26;

      let nearest = null;
      let nearestDistance = Infinity;

      for (const entry of interactivePoints) {
        const distance = Math.hypot(
          entry.x - pointerX,
          entry.y - pointerY
        );

        if (distance < nearestDistance) {
          nearest = entry;
          nearestDistance = distance;
        }
      }

      return nearestDistance <= radius ? nearest : null;
    }

    pointerLayer.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;

      const nearest = nearestPoint(event);

      if (!nearest) {
        hideTooltip();
        return;
      }

      showTooltip(
        pointerLayer,
        nearest.item,
        nearest.point,
        options.unit,
        { x: event.clientX, y: event.clientY }
      );
    });

    pointerLayer.addEventListener("pointerleave", hideTooltip);

    pointerLayer.addEventListener("click", (event) => {
      const nearest = nearestPoint(event);

      if (nearest) {
        chooseCondition(
          nearest.item.speed,
          nearest.point.flow
        );
      }
    });

    svg.append(pointerLayer);
    host.replaceChildren(svg);
  }

  /* =====================================================
     MAIN CHARTS
  ===================================================== */

  function drawCharts() {
    const visibleSpeeds = $("overlay").checked
      ? SPEEDS
      : [state.speed];

    const uptakeSeries = visibleSpeeds.map((speed) =>
      makeSeries(speed, "uptake", { decimals: 4 })
    );

    if ($("show-total").checked) {
      uptakeSeries.push(
        makeSeries(state.speed, "totalCo2", {
          label: `${state.speed} Hz total carbon`,
          color: "var(--total-carbon)",
          shape: "diamond",
          dash: "8 4",
          hollow: true,
          decimals: 4
        })
      );
    }

    drawChart("uptakechart", uptakeSeries, {
      title: "CO₂ concentration by flowmeter setting",
      axisLabel: "CO₂ equivalent (g/L)",
      unit: "g/L",
      reference: state.uptakeTarget,
      referenceLabel: state.uptakeTarget === null
        ? ""
        : `Uptake target: ${format(state.uptakeTarget, 3)} g/L`
    });

    drawChart(
      "effchart",
      visibleSpeeds.map((speed) =>
        makeSeries(speed, "efficiency", {
          decimals: 2
        })
      ),
      {
        title: "Dissolution efficiency by flowmeter setting",
        axisLabel: "Dissolution efficiency (%)",
        unit: "%"
      }
    );

    drawDeliveryCharts();
  }

  /* =====================================================
     WATER AND GAS DELIVERY CHARTS
  ===================================================== */

  function drawDeliveryCharts() {
    const speed = state.speed;
    const points = DATA[speed];
    const assumed = points.some((point) => point.waterMassAssumed);

    $("delivery-speed").textContent = `${speed} Hz selected`;
    $("water-assumption-legend").hidden = !assumed;

    if (speed === 20) {
      $("delivery-note").textContent =
        "At 20 Hz, weighed water collection falls as CO₂ supply " +
        "increases. The downstream meter controls batch shut-off. " +
        "Heavy bubbling was observed, but gas interference and " +
        "hydraulic changes have not been confirmed as the causes.";

      $("delivery-note").dataset.status = "attention";
    } else if (assumed) {
      $("delivery-note").textContent =
        "For 30 Hz, 8 kg of water is assumed for every collection. " +
        "The flat water-mass line represents that assumption, " +
        "not verified delivery accuracy or measured repeatability. " +
        "Both flowmeter readings and cylinder mass losses " +
        "remain recorded measurements.";

      $("delivery-note").dataset.status = "attention";
    } else {
      $("delivery-note").textContent =
        `At ${speed} Hz, separate flowmeter readings, weighed water ` +
        "collections and cylinder mass losses are available. " +
        "Compare collected water with the 10 kg setpoint. " +
        "Values above or below it show the recorded delivery difference.";

      $("delivery-note").dataset.status = "neutral";
    }

    drawChart(
      "waterflowchart",
      [
        makeSeries(speed, "waterFlow1", {
          label: "Point 1: before CO₂ injection",
          color: "var(--flow-upstream)",
          shape: "circle",
          dash: "",
          decimals: 2
        }),
        makeSeries(speed, "waterFlow2", {
          label: "Point 2: after mixers",
          color: "var(--flow-downstream)",
          shape: "square",
          dash: "6 4",
          decimals: 2
        })
      ],
      {
        title: "Upstream and downstream flowmeter indications",
        axisLabel: "Indicated flow (L/min)",
        unit: "L/min indicated"
      }
    );

    const setpoints = [
      ...new Set(
        points.map((point) => point.waterSetpoint)
          .filter(Number.isFinite)
      )
    ];

    const setpoint = setpoints.length === 1
      ? setpoints[0]
      : null;

    $("water-chart-title").textContent = assumed
      ? "Assumed water mass against the setpoint"
      : "Water collected against the setpoint";

    $("water-chart-caption").textContent = assumed
      ? (
          "Open markers show the assumed 8 kg water mass. " +
          "No measured water-mass spread or delivery deviation " +
          "is assigned to these assumed values."
        )
      : (
          "Markers show average independently weighed collections. " +
          "The dashed reference shows the configured water setpoint."
        );

    drawChart(
      "deliverychart",
      [
        makeSeries(speed, "waterKg", {
          label: assumed
            ? "30 Hz assumed water mass"
            : `${speed} Hz weighed water`,
          hollow: assumed,
          dash: assumed ? "3 4" : "",
          decimals: 2
        })
      ],
      {
        title: assumed
          ? "Assumed water mass against setpoint"
          : "Independently weighed water against setpoint",
        axisLabel: assumed
          ? "Assumed water mass (kg)"
          : "Collected water (kg)",
        unit: "kg",
        reference: setpoint,
        referenceLabel: setpoint === null
          ? ""
          : `${format(setpoint, 0)} kg setpoint`,
        referenceColor: "var(--muted)"
      }
    );

    $("gas-chart-caption").textContent = assumed
      ? (
          "Cylinder mass loss was recorded. Added dissolved CO₂ " +
          "mass uses the assumed 8 L water volume. These quantities " +
          "are per collection, not per minute."
        )
      : (
          "Added dissolved mass is calculated for each trial from " +
          "its uptake and weighed water collection, then averaged. " +
          "Collections may differ in water mass and duration; " +
          "these quantities are not rates per minute."
        );

    drawChart(
      "gaschart",
      [
        makeSeries(speed, "co2Grams", {
          label: "Supplied: cylinder mass loss",
          color: "var(--gas-supplied)",
          shape: "square",
          dash: "6 4",
          decimals: 3
        }),
        makeSeries(speed, "uptakeGrams", {
          label: assumed
            ? "Added dissolved CO₂: assumed water volume"
            : "Additional dissolved CO₂",
          color: "var(--gas-dissolved)",
          shape: "circle",
          dash: "",
          hollow: assumed,
          decimals: 3
        })
      ],
      {
        title: "CO₂ supplied and dissolved per collection",
        axisLabel: "CO₂ per collection (g)",
        unit: "g"
      }
    );
  }

  function scheduleCharts() {
    if (chartFrame !== null) {
      window.cancelAnimationFrame(chartFrame);
    }

    chartFrame = window.requestAnimationFrame(() => {
      chartFrame = null;
      hideTooltip();
      drawCharts();
    });
  }

  /* =====================================================
     OPTIONAL UPTAKE TARGET
  ===================================================== */

  function applyUptakeTarget(event) {
    event.preventDefault();

    const input = $("uptake-threshold");
    const error = $("threshold-error");

    const blank =
      input.value.trim() === "" &&
      !input.validity.badInput;

    const value = blank ? null : Number(input.value);

    const invalid =
      !blank &&
      (
        input.validity.badInput ||
        !Number.isFinite(value) ||
        value < 0
      );

    input.setAttribute("aria-invalid", String(invalid));
    error.hidden = !invalid;

    if (invalid) {
      error.textContent =
        "Enter a target of zero or more, or leave it blank.";

      $("threshold-status").textContent =
        "The previous applied target has been kept.";

      scrollToElement(input, true);
      return;
    }

    state.uptakeTarget = value;

    $("threshold-status").textContent = value === null
      ? "No uptake target applied."
      : `Applied uptake target: ${format(value, 3)} g/L.`;

    updateMetrics();
    drawCharts();
  }

  /* =====================================================
     CONDITION COMPARISON
  ===================================================== */

  function updateComparison() {
    const [speedA, flowA] =
      $("a").value.split(",").map(Number);

    const [speedB, flowB] =
      $("b").value.split(",").map(Number);

    const a = getResult(speedA, flowA);
    const b = getResult(speedB, flowB);

    if (!a || !b) return;

    const includesAssumption =
      a.waterMassAssumed || b.waterMassAssumed;

    const measures = [
      {
        key: "uptake",
        label: "Added uptake (g/L)",
        decimals: 4
      },
      {
        key: "efficiency",
        label: "Dissolution efficiency (%)",
        decimals: 2,
        differenceUnit: " points",
        assumptionDependent: true
      },
      {
        key: "totalCo2",
        label: "Total carbon (g/L as CO₂)",
        decimals: 4
      },
      {
        key: "waterKg",
        label: "Water mass used (kg)",
        decimals: 2,
        isWaterMass: true
      },
      {
        key: "waterSetpoint",
        label: "Water setpoint (kg)",
        decimals: 2
      },
      {
        key: "waterDeviationPercent",
        label: "Weighed water deviation from setpoint (%)",
        decimals: 2,
        measuredOnly: true,
        differenceUnit: " points"
      },
      {
        key: "co2Grams",
        label: "CO₂ supplied (g)",
        decimals: 3
      },
      {
        key: "uptakeGrams",
        label: "Additional CO₂ dissolved (g)",
        decimals: 3,
        assumptionDependent: true
      }
    ];

    function displayValue(result, measure) {
      if (
        measure.measuredOnly &&
        result.waterMassAssumed
      ) {
        return "Not verified";
      }

      const value = result[measure.key];

      if (!Number.isFinite(value)) return "Not available";

      let text = format(value, measure.decimals);

      if (measure.isWaterMass) {
        text += result.waterMassAssumed
          ? " (assumed)"
          : " (weighed)";
      } else if (
        measure.assumptionDependent &&
        result.waterMassAssumed
      ) {
        text += " (assumed water volume)";
      }

      return text;
    }

    const rows = measures.map((measure) => {
      const valueA = a[measure.key];
      const valueB = b[measure.key];

      let difference = "Not available";

      if (measure.isWaterMass && includesAssumption) {
        difference = "Not compared: assumed water mass";
      } else if (measure.measuredOnly && includesAssumption) {
        difference = "Not verified";
      } else if (
        Number.isFinite(valueA) &&
        Number.isFinite(valueB)
      ) {
        difference =
          signed(valueB - valueA, measure.decimals) +
          (measure.differenceUnit ?? "");

        if (measure.assumptionDependent && includesAssumption) {
          difference += " (includes assumption)";
        }
      }

      return `
        <tr>
          <th scope="row">${escapeHTML(measure.label)}</th>
          <td>${escapeHTML(displayValue(a, measure))}</td>
          <td>${escapeHTML(displayValue(b, measure))}</td>
          <td>${escapeHTML(difference)}</td>
        </tr>
      `;
    }).join("");

    const uptakeDifference = b.uptake - a.uptake;
    const efficiencyDifference = b.efficiency - a.efficiency;

    const uptakeSentence = uptakeDifference === 0
      ? "Both conditions have the same mean uptake."
      : (
          `Condition B has ` +
          `${format(Math.abs(uptakeDifference), 4)} g/L ` +
          `${uptakeDifference > 0 ? "more" : "less"} added uptake` +
          (
            a.uptake > 0
              ? (
                  ` (${format(
                    Math.abs(uptakeDifference / a.uptake * 100),
                    1
                  )}% ${uptakeDifference > 0 ? "higher" : "lower"} ` +
                  "than A)."
                )
              : "."
          )
        );

    const efficiencySentence = efficiencyDifference === 0
      ? "The mean efficiencies are equal."
      : (
          `Its calculated efficiency is ` +
          `${format(Math.abs(efficiencyDifference), 2)} ` +
          `percentage points ` +
          `${efficiencyDifference > 0 ? "higher" : "lower"}.`
        );

    const deliverySentence = includesAssumption
      ? (
          "This comparison includes 30 Hz, where 8 kg water " +
          "per collection is assumed. Its dissolved masses and " +
          "efficiencies depend on that assumption, and its " +
          "delivery accuracy is not verified."
        )
      : (
          `Average weighed water collection is ` +
          `${format(a.waterKg, 2)} kg for A and ` +
          `${format(b.waterKg, 2)} kg for B. ` +
          "Compare these with the corresponding setpoints."
        );

    $("comparison").innerHTML = `
      <div class="table-wrap">
        <table>
          <caption>
            Setting means and the difference B minus A
          </caption>

          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">A: ${speedA} Hz / ${flowA} L/min</th>
              <th scope="col">B: ${speedB} Hz / ${flowB} L/min</th>
              <th scope="col">B minus A</th>
            </tr>
          </thead>

          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="comparison-summary">
        <p>
          ${escapeHTML(uptakeSentence)}
          ${escapeHTML(efficiencySentence)}
        </p>

        <p>${escapeHTML(deliverySentence)}</p>
      </div>
    `;
  }

  /* =====================================================
     MANUAL DOSE CALCULATION
  ===================================================== */

  function setCalculationState(text, status) {
    $("dose-state").textContent = text;
    $("dose-state").dataset.state = status;

    $("floating-calc-status").textContent = text;
    $("calculate-bar").dataset.state = status;
  }

  function markDoseDirty() {
    setCalculationState(
      "Inputs changed - calculate to update",
      "dirty"
    );

    $("dose-results").dataset.stale =
      String(Boolean(state.lastCalculation));
  }

  function clearDoseErrors() {
    $("dose-errors").hidden = true;
    $("dose-errors").replaceChildren();

    for (const id of ["cement", "water", "target"]) {
      $(id).removeAttribute("aria-invalid");
      $(`${id}-error`).hidden = true;
      $(`${id}-error`).textContent = "";
    }
  }

  function readDoseInput(id) {
    const input = $(id);
    const text = input.value.trim();

    let error = "";
    let value = null;

    if (input.validity.badInput) {
      error = "Enter a valid number.";
    } else if (text === "") {
      const messages = {
        cement: "Enter the cement mass.",
        water: "Enter the carbonated water volume.",
        target:
          "Enter the target CO₂ dose. Use 0 if no added CO₂ is requested."
      };

      error = messages[id];
    } else {
      value = Number(text);

      if (!Number.isFinite(value)) {
        error = "Enter a finite number.";
      } else if (id === "cement" && value <= 0) {
        error = "Cement mass must be greater than zero.";
      } else if (id !== "cement" && value < 0) {
        error = id === "water"
          ? "Water volume cannot be negative."
          : "Target CO₂ dose cannot be negative.";
      }
    }

    return { id, value, error };
  }

  function showDoseErrors(errors) {
    const box = $("dose-errors");

    const heading = document.createElement("strong");
    heading.textContent =
      "Complete these fields before calculating:";

    const list = document.createElement("ul");

    for (const item of errors) {
      const field = $(item.id);

      field.setAttribute("aria-invalid", "true");

      const fieldError = $(`${item.id}-error`);
      fieldError.textContent = item.error;
      fieldError.hidden = false;

      const listItem = document.createElement("li");
      const link = document.createElement("a");

      link.href = `#${item.id}`;
      link.textContent = item.error;

      link.addEventListener("click", (event) => {
        event.preventDefault();
        scrollToElement(field, true);
      });

      listItem.append(link);
      list.append(listItem);
    }

    box.replaceChildren(heading, list);
    box.hidden = false;

    setCalculationState(
      "Check the highlighted inputs",
      "invalid"
    );

    $("dose-results").dataset.stale =
      String(Boolean(state.lastCalculation));

    scrollToElement($(errors[0].id), true);
  }

  function calculateDose(event) {
    event.preventDefault();

    clearDoseErrors();

    const fields = ["cement", "water", "target"]
      .map(readDoseInput);

    const errors = fields.filter((field) => field.error);

    if (errors.length) {
      showDoseErrors(errors);
      return;
    }

    const values = Object.fromEntries(
      fields.map((field) => [field.id, field.value])
    );

    const result = selectedResult();

    const addedMass = result.uptake * values.water;
    const dosePercent = addedMass / values.cement / 10;
    const targetMass = values.target * values.cement * 10;
    const targetWater = targetMass / result.uptake;

    if (
      ![addedMass, dosePercent, targetMass, targetWater]
        .every(Number.isFinite)
    ) {
      showDoseErrors([
        {
          id: "cement",
          error:
            "These quantities are too large to calculate. " +
            "Check the batch quantities and units."
        }
      ]);

      return;
    }

    const snapshot = {
      speed: state.speed,
      flow: state.flow,
      uptake: result.uptake,
      cement: values.cement,
      water: values.water,
      target: values.target,
      addedMass,
      dosePercent,
      targetMass,
      targetWater
    };

    state.lastCalculation = snapshot;

    renderDoseResult(snapshot);

    setCalculationState("Results up to date", "current");
    $("dose-results").dataset.stale = "false";

    if (!isVisible($("dose-results-title"))) {
      scrollToElement($("dose-results-title"), true);
    }
  }

  function renderDoseResult(calculation) {
    const {
      speed,
      flow,
      uptake,
      cement,
      water,
      target,
      addedMass,
      dosePercent,
      targetMass,
      targetWater
    } = calculation;

    $("dose-placeholder").hidden = true;
    $("dose-result-content").hidden = false;

    $("dosepercent").textContent =
      `${format(dosePercent, 5)}%`;

    $("dosemass").textContent =
      `${format(water, 3)} L of carbonated water carries ` +
      `${format(addedMass, 3)} g of additional dissolved CO₂.`;

    const status = $("dose-target-status");
    const difference = addedMass - targetMass;

    /*
     * Numerical tolerance only removes computer arithmetic
     * noise. It is not a measurement or process tolerance.
     */
    const numericalTolerance =
      Number.EPSILON *
      Math.max(Math.abs(addedMass), Math.abs(targetMass), 1) *
      8;

    if (Math.abs(difference) <= numericalTolerance) {
      status.textContent = "Matches the target dose";
      status.dataset.status = "meets";
    } else if (difference < 0) {
      status.textContent =
        `${format(Math.abs(difference), 3)} g below target`;

      status.dataset.status = "below";
    } else {
      status.textContent =
        `${format(difference, 3)} g above target`;

      /*
       * Above target is descriptive, not automatically
       * classified as a better operating outcome.
       */
      status.dataset.status = "neutral";
    }

    $("targetresult").textContent =
      `Your target of ${format(target, 5)}% requires ` +
      `${format(targetMass, 3)} g of added CO₂. ` +
      `At ${format(uptake, 4)} g/L, approximately ` +
      `${format(targetWater, 3)} L of carbonated water ` +
      "would carry that amount. This is a dose calculation, " +
      "not a recommendation to change the mix water.";

    $("dose-calculation-basis").textContent =
      `Calculated using ${speed} Hz / ${flow} L/min, ` +
      `${format(uptake, 4)} g/L added uptake, ` +
      `${format(cement, 3)} kg cement and ` +
      `${format(water, 3)} L of carbonated water entered above. ` +
      "The trial collection setpoint is not substituted " +
      "for your entered batch water.";
  }

  /* =====================================================
     FLOATING CALCULATE BUTTON
  ===================================================== */

  function connectFloatingCalculator() {
    const section = $("dose");
    const bar = $("calculate-bar");

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          bar.hidden = !entries[0].isIntersecting;
        },
        {
          rootMargin: "-120px 0px -80px 0px",
          threshold: 0
        }
      );

      observer.observe(section);
      return;
    }

    const checkPosition = () => {
      const bounds = section.getBoundingClientRect();

      bar.hidden = !(
        bounds.bottom > 120 &&
        bounds.top < window.innerHeight - 80
      );
    };

    window.addEventListener("scroll", checkPosition, {
      passive: true
    });

    window.addEventListener("resize", checkPosition);
    checkPosition();
  }

  /* =====================================================
     SUMMARY CSV
  ===================================================== */

  function csvCell(value) {
    if (value === null || value === undefined) return "";

    const text = String(value);

    return /[",\r\n]/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  }

  function downloadCSV() {
    const columns = [
      ["pump_hz", (speed) => speed],
      ["co2_setting_l_min", (_, result) => result.flow],
      ["added_uptake_g_l", (_, result) => result.uptake],
      ["efficiency_percent", (_, result) => result.efficiency],
      [
        "total_carbon_as_co2_g_l",
        (_, result) => result.totalCo2
      ],
      [
        "water_mass_used_kg",
        (_, result) => result.waterKg
      ],
      [
        "water_mass_basis",
        (_, result) => result.waterMassBasis
      ],
      [
        "independently_weighed_water_kg",
        (_, result) => result.measuredWaterKg
      ],
      [
        "water_setpoint_kg",
        (_, result) => result.waterSetpoint
      ],
      [
        "weighed_water_deviation_percent",
        (_, result) => result.waterDeviationPercent
      ],
      ["co2_supplied_g", (_, result) => result.co2Grams],
      [
        "added_co2_dissolved_g",
        (_, result) => result.uptakeGrams
      ],
      [
        "total_dissolved_carbon_as_co2_g",
        (_, result) => result.totalCo2Grams
      ],
      [
        "point1_indicated_l_min",
        (_, result) => result.waterFlow1
      ],
      [
        "point2_indicated_l_min",
        (_, result) => result.waterFlow2
      ],
      ["handheld_inlet_ph", (_, result) => result.inletPh],
      ["handheld_outlet_ph", (_, result) => result.outletPh],
      [
        "inlet_temperature_c",
        (_, result) => result.inletTemp
      ],
      [
        "outlet_temperature_c",
        (_, result) => result.outletTemp
      ],
      [
        "recorded_pressure_bar_reference_unconfirmed",
        (_, result) => result.pressure
      ],
      ["uptake_sd_g_l", (_, result) => result.uptakeSD],
      [
        "efficiency_sd_percentage_points",
        (_, result) => result.efficiencySD
      ],
      ["uptake_min_g_l", (_, result) => result.uptakeMin],
      ["uptake_max_g_l", (_, result) => result.uptakeMax],
      ["repeat_count", (_, result) => result.repeatCount],
      [
        "calculation_note",
        (speed) => assumptionNote(speed)
      ]
    ];

    const lines = [
      columns.map(([heading]) => csvCell(heading)).join(",")
    ];

    for (const speed of SPEEDS) {
      for (const result of DATA[speed]) {
        lines.push(
          columns
            .map(([, getter]) => csvCell(getter(speed, result)))
            .join(",")
        );
      }
    }

    const blob = new Blob(
      ["\uFEFF", lines.join("\r\n")],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "co2-water-optimisation-summary.csv";

    document.body.append(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* =====================================================
     EVENTS
  ===================================================== */

  function updateSelection() {
    updateControls();
    updateMetrics();
    updateRepeats();
    drawCharts();
  }

  function connectEvents() {
    for (const id of [
      "overlay",
      "errors",
      "show-repeats",
      "show-total"
    ]) {
      $(id).addEventListener("change", () => {
        hideTooltip();
        updateControls();
        updateChartNote();
        drawCharts();
      });
    }

    for (const id of ["a", "b"]) {
      $(id).addEventListener("change", updateComparison);
    }

    $("threshold-form").addEventListener(
      "submit",
      applyUptakeTarget
    );

    $("uptake-threshold").addEventListener("input", () => {
      $("uptake-threshold").removeAttribute("aria-invalid");
      $("threshold-error").hidden = true;

      $("threshold-status").textContent =
        "Target edited - apply to update.";
    });

    /*
     * Editing dose fields changes only the pending status.
     * No calculation or new validation error is triggered.
     */
    for (const id of ["cement", "water", "target"]) {
      $(id).addEventListener("input", markDoseDirty);
    }

    /*
     * Inline button, floating button and Enter submit
     * the same calculation form.
     */
    $("dose-form").addEventListener("submit", calculateDose);

    document.querySelectorAll("[data-pick]").forEach((button) => {
      button.addEventListener("click", () => {
        const [speed, flow] =
          button.dataset.pick.split(",").map(Number);

        chooseCondition(speed, flow);

        $("explore").scrollIntoView({
          behavior: motionBehaviour(),
          block: "start"
        });
      });
    });

    $("download").addEventListener("click", downloadCSV);

    window.addEventListener("scroll", hideTooltip, {
      passive: true
    });

    window.addEventListener("resize", scheduleCharts);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideTooltip();
      }
    });

    if ("ResizeObserver" in window) {
      const widths = new WeakMap();

      const observer = new ResizeObserver((entries) => {
        let changed = false;

        for (const entry of entries) {
          const width = Math.round(entry.contentRect.width);

          if (widths.get(entry.target) !== width) {
            widths.set(entry.target, width);
            changed = true;
          }
        }

        if (changed) {
          scheduleCharts();
        }
      });

      for (const id of [
        "uptakechart",
        "effchart",
        "waterflowchart",
        "deliverychart",
        "gaschart"
      ]) {
        observer.observe($(id));
      }
    }

    connectFloatingCalculator();
  }

  /* =====================================================
     START
  ===================================================== */

  createControls();
  connectEvents();

  updateSelection();
  updateComparison();

  setCalculationState("Ready to calculate", "ready");
})();