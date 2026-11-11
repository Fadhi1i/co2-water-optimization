"use strict";

(() => {
  const DATA = window.RESULTS;
  const $ = (id) => document.getElementById(id);

  const SPEEDS = [30, 40, 50];
  const FLOWS = [5, 10, 15, 17, 20, 25];

  const COLORS = {
    30: "#b77a2d",
    40: "#167c86",
    50: "#8260ab"
  };

  const state = {
    speed: 40,
    flow: 17
  };

  const format = (value, decimals = 4) =>
    Number(value).toFixed(decimals);

  const getResult = (speed, flow) =>
    DATA[speed].find((result) => result.flow === Number(flow));

  const selectedResult = () =>
    getResult(state.speed, state.flow);

  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function sampleSD(values) {
    if (values.length < 2) return undefined;

    const average = mean(values);

    const variance =
      values.reduce(
        (sum, value) => sum + (value - average) ** 2,
        0
      ) /
      (values.length - 1);

    return Math.sqrt(variance);
  }

  // Calculate repeat statistics directly from the available readings.
  for (const speed of SPEEDS) {
    for (const result of DATA[speed]) {
      if (!result.repeats?.length) continue;

      const uptakeValues = result.repeats.map(
        (repeat) => repeat.uptake
      );

      const efficiencyValues = result.repeats.map(
        (repeat) => repeat.efficiency
      );

      result.uptake = mean(uptakeValues);
      result.efficiency = mean(efficiencyValues);
      result.uptakeSD = sampleSD(uptakeValues);
      result.efficiencySD = sampleSD(efficiencyValues);
    }
  }

  function hideTooltip() {
    $("tooltip").hidden = true;
  }

  function chooseCondition(speed, flow) {
    state.speed = Number(speed);
    state.flow = Number(flow);

    hideTooltip();
    update();
  }

  function createControls() {
    for (const speed of SPEEDS) {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = `${speed} Hz`;
      button.dataset.speed = speed;

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

      button.addEventListener("click", () => {
        chooseCondition(state.speed, flow);
      });

      $("flows").append(button);
    }

    for (const selectId of ["a", "b"]) {
      for (const speed of SPEEDS) {
        for (const flow of FLOWS) {
          const option = document.createElement("option");

          option.value = `${speed},${flow}`;
          option.textContent = `${speed} Hz / ${flow} L/min`;

          $(selectId).append(option);
        }
      }
    }

    $("a").value = "30,17";
    $("b").value = "40,17";
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
  }

  function updateMetrics() {
    const result = selectedResult();

    $("uptake").textContent =
      `${format(result.uptake)} g/L`;

    $("efficiency").textContent =
      `${format(result.efficiency, 2)}%`;

    $("condition").textContent =
      `${state.speed} Hz / ${state.flow} L/min`;

    $("repeatcount").textContent = result.repeats
      ? `${result.repeats.length} recorded repeats`
      : "Earlier summary mean";

    $("pointdetail").textContent = result.repeats
      ? (
          `Repeat spread: uptake SD ` +
          `${format(result.uptakeSD, 5)} g/L; efficiency SD ` +
          `${format(result.efficiencySD, 2)} percentage points.`
        )
      : (
          "Repeat statistics are not available for this speed " +
          "in the current dataset."
        );
  }

  function updateRepeats() {
    const result = selectedResult();

    if (!result.repeats) {
      $("repeats").innerHTML = `
        <p>
          Individual repeats were not supplied for this speed
          in this version.
        </p>
      `;

      return;
    }

    const rows = result.repeats
      .map((repeat, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${format(repeat.uptake)}</td>
          <td>${format(repeat.efficiency, 2)}</td>
          <td>${format(repeat.waterKg, 2)}</td>
          <td>${format(repeat.co2Grams, 1)}</td>
        </tr>
      `)
      .join("");

    $("repeats").innerHTML = `
      <div class="tablewrap">
        <table>
          <caption>
            ${state.speed} Hz / ${state.flow} L/min
          </caption>

          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Uptake (g/L)</th>
              <th scope="col">Efficiency (%)</th>
              <th scope="col">Water (kg)</th>
              <th scope="col">CO₂ supplied (g)</th>
            </tr>
          </thead>

          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function readNumber(id) {
    const input = $(id);

    if (input.value.trim() === "") return null;

    const value = Number(input.value);

    return Number.isFinite(value) ? value : null;
  }

  function updateDose() {
    const result = selectedResult();

    const cement = readNumber("cement");
    const water = readNumber("water");
    const target = readNumber("target");

    $("doseselection").textContent =
      `Selected: ${state.speed} Hz / ${state.flow} L/min · ` +
      `${format(result.uptake)} g/L uptake`;

    const invalid =
      cement === null ||
      cement <= 0 ||
      water === null ||
      water < 0 ||
      target === null ||
      target < 0;

    if (invalid) {
      $("dosepercent").textContent = "Check inputs";

      $("dosemass").textContent =
        "Enter a positive cement mass and non-negative " +
        "water volume and target.";

      $("targetresult").textContent = "";

      return;
    }

    const addedMass = result.uptake * water;
    const dosePercent = addedMass / cement / 10;

    const targetMass = target * cement * 10;
    const targetWater = targetMass / result.uptake;

    if (
      ![addedMass, dosePercent, targetMass, targetWater]
        .every(Number.isFinite)
    ) {
      $("dosepercent").textContent = "Check inputs";
      $("dosemass").textContent =
        "The entered quantities are too large to calculate.";
      $("targetresult").textContent = "";

      return;
    }

    $("dosepercent").textContent =
      `${format(dosePercent, 5)}%`;

    $("dosemass").textContent =
      `${format(addedMass, 3)} g added CO₂ delivered ` +
      `in ${water} L carbonated water.`;

    $("targetresult").textContent =
      `Target: ${format(targetMass, 3)} g CO₂ (${target}%). ` +
      `At this concentration, ${format(targetWater, 2)} L ` +
      `carbonated water would carry that mass. ` +
      `This is a dose calculation, not a recommendation ` +
      `to change mix water.`;
  }

  function signed(value, decimals = 4) {
    const rounded = Number(value.toFixed(decimals));

    return `${rounded > 0 ? "+" : ""}${format(rounded, decimals)}`;
  }

  function updateComparison() {
    const [speedA, flowA] = $("a").value.split(",").map(Number);
    const [speedB, flowB] = $("b").value.split(",").map(Number);

    const a = getResult(speedA, flowA);
    const b = getResult(speedB, flowB);

    const uptakeDifference = b.uptake - a.uptake;
    const efficiencyDifference = b.efficiency - a.efficiency;

    const relativeUptakeChange =
      uptakeDifference / a.uptake * 100;

    $("comparison").innerHTML = `
      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">
                A: ${speedA} Hz / ${flowA} L/min
              </th>
              <th scope="col">
                B: ${speedB} Hz / ${flowB} L/min
              </th>
              <th scope="col">B − A</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>Added uptake (g/L)</td>
              <td>${format(a.uptake)}</td>
              <td>${format(b.uptake)}</td>
              <td>${signed(uptakeDifference)}</td>
            </tr>

            <tr>
              <td>Dissolution efficiency (%)</td>
              <td>${format(a.efficiency, 2)}</td>
              <td>${format(b.efficiency, 2)}</td>
              <td>
                ${signed(efficiencyDifference, 2)} points
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="note">
        Uptake changes by ${signed(relativeUptakeChange, 1)}%
        relative to A. Efficiency differences are expressed in
        percentage points. These comparisons use tested means
        and do not establish statistical significance.
      </p>
    `;
  }

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

  function showTooltip(event, speed, result, key) {
    const tooltip = $("tooltip");
    const unit = key === "uptake" ? "g/L" : "%";
    const decimals = key === "uptake" ? 4 : 2;

    tooltip.textContent =
      `${speed} Hz · ${result.flow} L/min · ` +
      `${format(result[key], decimals)} ${unit}`;

    tooltip.hidden = false;

    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;

    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - width - 8,
        event.clientX + 12
      )
    );

    const preferredTop = event.clientY - height - 12;

    const top = preferredTop >= 8
      ? preferredTop
      : Math.min(
          window.innerHeight - height - 8,
          event.clientY + 12
        );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function drawChart(containerId, key, axisLabel) {
    const host = $(containerId);

    const width = Math.max(
      260,
      Math.floor(host.getBoundingClientRect().width)
    );

    const height = 300;

    const margin = {
      left: 64,
      right: 18,
      top: 18,
      bottom: 60
    };

    const right = width - margin.right;
    const bottom = height - margin.bottom;

    const showErrors = $("errors").checked;

    const visibleSpeeds = $("overlay").checked
      ? SPEEDS
      : [state.speed];

    const sdKey = key === "uptake"
      ? "uptakeSD"
      : "efficiencySD";

    const maximum = Math.max(
      ...visibleSpeeds.flatMap((speed) =>
        DATA[speed].map((result) =>
          result[key] +
          (showErrors ? (result[sdKey] ?? 0) : 0)
        )
      )
    );

    const yMaximum = maximum * 1.15;

    const x = (value) =>
      margin.left +
      ((value - 4) / 22) * (right - margin.left);

    const y = (value) =>
      bottom -
      (value / yMaximum) * (bottom - margin.top);

    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label":
        `${axisLabel} versus CO₂ flowmeter setting. ` +
        "Select a point to inspect its operating condition."
    });

    svg.append(
      svgElement(
        "title",
        {},
        `${axisLabel} versus CO₂ flowmeter setting`
      )
    );

    // Horizontal gridlines and y-axis labels.
    for (let index = 0; index <= 4; index++) {
      const value = yMaximum * index / 4;
      const position = y(value);

      svg.append(
        svgElement("line", {
          x1: margin.left,
          x2: right,
          y1: position,
          y2: position,
          stroke: "#dce3da",
          "stroke-width": 1
        })
      );

      svg.append(
        svgElement(
          "text",
          {
            x: margin.left - 8,
            y: position + 4,
            "text-anchor": "end"
          },
          format(value, key === "uptake" ? 2 : 1)
        )
      );
    }

    // Axis baselines.
    svg.append(
      svgElement("path", {
        d:
          `M${margin.left},${margin.top}` +
          `V${bottom}H${right}`,
        fill: "none",
        stroke: "#b8c7bc",
        "stroke-width": 1
      })
    );

    const ticks = width < 370
      ? [5, 10, 17, 25]
      : FLOWS;

    for (const flow of ticks) {
      svg.append(
        svgElement(
          "text",
          {
            x: x(flow),
            y: bottom + 22,
            "text-anchor": "middle"
          },
          flow
        )
      );
    }

    svg.append(
      svgElement(
        "text",
        {
          x: (margin.left + right) / 2,
          y: height - 10,
          "text-anchor": "middle"
        },
        "CO₂ flowmeter setting (L/min)"
      )
    );

    svg.append(
      svgElement(
        "text",
        {
          transform:
            `translate(15 ${(margin.top + bottom) / 2}) ` +
            "rotate(-90)",
          "text-anchor": "middle"
        },
        axisLabel
      )
    );

    // Draw the selected speed last so its points remain visible.
    const drawingOrder = [
      ...visibleSpeeds.filter(
        (speed) => speed !== state.speed
      ),
      ...visibleSpeeds.filter(
        (speed) => speed === state.speed
      )
    ];

    for (const speed of drawingOrder) {
      const results = DATA[speed];
      const color = COLORS[speed];
      const isSelectedSpeed = speed === state.speed;

      const path = results
        .map((result, index) => {
          const command = index === 0 ? "M" : "L";

          return (
            `${command}${x(result.flow)},${y(result[key])}`
          );
        })
        .join(" ");

      svg.append(
        svgElement("path", {
          d: path,
          fill: "none",
          stroke: color,
          "stroke-width": isSelectedSpeed ? 3 : 1.7,
          "stroke-dasharray":
            speed === 30 ? "" : speed === 40 ? "7 3" : "2 3",
          opacity: isSelectedSpeed ? 1 : 0.65
        })
      );

      for (const result of results) {
        const pointX = x(result.flow);
        const pointY = y(result[key]);

        if (
          showErrors &&
          Number.isFinite(result[sdKey])
        ) {
          const upper = y(result[key] + result[sdKey]);

          const lower = y(
            Math.max(0, result[key] - result[sdKey])
          );

          svg.append(
            svgElement("path", {
              d: [
                `M${pointX},${upper}V${lower}`,
                `M${pointX - 4},${upper}H${pointX + 4}`,
                `M${pointX - 4},${lower}H${pointX + 4}`
              ].join(" "),
              fill: "none",
              stroke: color,
              "stroke-width": 1.4
            })
          );
        }

        if (
          isSelectedSpeed &&
          result.flow === state.flow
        ) {
          svg.append(
            svgElement("circle", {
              cx: pointX,
              cy: pointY,
              r: 9,
              fill: "none",
              stroke: color,
              "stroke-width": 2
            })
          );
        }

        let marker;

        if (speed === 40) {
          marker = svgElement("path", {
            d:
              `M${pointX},${pointY - 5}` +
              `L${pointX + 5},${pointY + 4}` +
              `H${pointX - 5}Z`,
            fill: color
          });
        } else if (speed === 50) {
          marker = svgElement("rect", {
            x: pointX - 4,
            y: pointY - 4,
            width: 8,
            height: 8,
            fill: color
          });
        } else {
          marker = svgElement("circle", {
            cx: pointX,
            cy: pointY,
            r: 4,
            fill: color
          });
        }

        svg.append(marker);

        const unit = key === "uptake" ? "g/L" : "percent";

        const hitTarget = svgElement("circle", {
          cx: pointX,
          cy: pointY,
          r: 15,
          fill: "transparent",
          tabindex: 0,
          role: "button",
          "aria-label":
            `${speed} Hz, ${result.flow} L/min: ` +
            `${format(result[key], key === "uptake" ? 4 : 2)} ` +
            unit
        });

        const choose = () => {
          chooseCondition(speed, result.flow);
        };

        hitTarget.addEventListener("click", choose);

        hitTarget.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            choose();
          }
        });

        hitTarget.addEventListener("pointermove", (event) => {
          if (event.pointerType !== "touch") {
            showTooltip(event, speed, result, key);
          }
        });

        hitTarget.addEventListener(
          "pointerleave",
          hideTooltip
        );

        hitTarget.addEventListener("blur", hideTooltip);

        svg.append(hitTarget);
      }
    }

    host.replaceChildren(svg);
  }

  function drawCharts() {
    drawChart(
      "uptakechart",
      "uptake",
      "Added uptake (g/L)"
    );

    drawChart(
      "effchart",
      "efficiency",
      "Dissolution efficiency (%)"
    );
  }

  function downloadCSV() {
    const lines = [
      [
        "pump_hz",
        "co2_setting_l_min",
        "added_uptake_g_l",
        "efficiency_percent",
        "uptake_sd_g_l",
        "efficiency_sd_percentage_points",
        "repeat_count"
      ].join(",")
    ];

    for (const speed of SPEEDS) {
      for (const result of DATA[speed]) {
        lines.push(
          [
            speed,
            result.flow,
            result.uptake,
            result.efficiency,
            result.uptakeSD ?? "",
            result.efficiencySD ?? "",
            result.repeats?.length ?? ""
          ].join(",")
        );
      }
    }

    const blob = new Blob(
      [lines.join("\r\n")],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "water-optimization-summary.csv";

    document.body.append(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function update() {
    updateControls();
    updateMetrics();
    updateRepeats();
    updateDose();
    drawCharts();
  }

  function connectEvents() {
    for (const id of ["overlay", "errors"]) {
      $(id).addEventListener("change", () => {
        hideTooltip();
        drawCharts();
      });
    }

    for (const id of ["cement", "water", "target"]) {
      $(id).addEventListener("input", updateDose);
    }

    for (const id of ["a", "b"]) {
      $(id).addEventListener("change", updateComparison);
    }

    document.querySelectorAll("[data-pick]").forEach((button) => {
      button.addEventListener("click", () => {
        const [speed, flow] =
          button.dataset.pick.split(",").map(Number);

        chooseCondition(speed, flow);

        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;

        $("explore").scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth"
        });
      });
    });

    $("download").addEventListener("click", downloadCSV);

    window.addEventListener("scroll", hideTooltip, {
      passive: true
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideTooltip();
    });
  }

  createControls();
  connectEvents();
  updateComparison();
  update();

  let previousWidth = 0;
  let resizeFrame;

  const observer = new ResizeObserver((entries) => {
    const width = Math.round(entries[0].contentRect.width);

    if (width === previousWidth) return;

    previousWidth = width;

    window.cancelAnimationFrame(resizeFrame);

    resizeFrame = window.requestAnimationFrame(drawCharts);
  });

  observer.observe($("uptakechart"));
})();