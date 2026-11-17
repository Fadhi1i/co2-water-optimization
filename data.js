"use strict";

(() => {
  /*
   * CO2 WATER OPTIMISATION DATA
   *
   * Sources:
   * 20 Hz: user-supplied individual trial table.
   * 30 Hz: user-supplied individual trial table.
   * 40 Hz: corrected table supplied by the user.
   * 50 Hz: original 50HZ.xlsx workbook.
   *
   * WATER MASS:
   * 20, 40 and 50 Hz: independently weighed collections.
   * 30 Hz: 8 kg per collection, explicitly assumed with
   *        the user's agreement. It was not independently
   *        recorded on the scale during those trials.
   *
   * CALCULATIONS:
   * Supplied CO2 (g):
   *   (Cylinder before kg - cylinder after kg) * 1000
   *
   * Approximate water volume (L):
   *   Water mass kg / 1 kg/L
   *
   * Added dissolved CO2 (g):
   *   PHREEQC uptake g/L * water volume L
   *
   * Total dissolved carbon as CO2 equivalent (g):
   *   Total concentration g/L * water volume L
   *
   * Dissolution efficiency (%):
   *   Added dissolved CO2 g / supplied CO2 g * 100
   *
   * Setting averages:
   *   Arithmetic means of individual trial values.
   *
   * Repeat spread:
   *   Sample standard deviation.
   *
   * IMPORTANT:
   * - Point 1 and Point 2 are kept separate.
   * - No meter readings are automatically swapped.
   * - No collection duration is inferred from timestamps.
   * - Pressure reference and location are not confirmed here.
   * - System dissolved-CO2 readings are retained only as
   *   recorded sensor readings, without assuming their units
   *   or calibration.
   * - A water-delivery deviation is calculated only where
   *   collected water was independently weighed.
   */

  const SPEEDS = [20, 30, 40, 50];
  const FLOW_SETTINGS = [5, 10, 15, 17, 20, 25];
  const WATER_DENSITY_KG_L = 1;

  /*
   * Common raw row order:
   *
   *  0: Recorded time, or null if unavailable
   *  1: CO2 flowmeter setting, L/min
   *  2: Cylinder weight before, kg
   *  3: Cylinder weight after, kg
   *  4: Point 1 water flowmeter indication, L/min
   *  5: Point 2 water flowmeter indication, L/min
   *  6: Handheld inlet pH
   *  7: Handheld outlet pH
   *  8: Inlet temperature, degrees C
   *  9: Outlet temperature, degrees C
   * 10: Recorded pressure, bar
   * 11: Water setpoint, kg
   * 12: Water mass used in calculations, kg
   * 13: PHREEQC added CO2 uptake, g/L
   * 14: Total dissolved carbon as CO2 equivalent, g/L
   * 15: System pH, where supplied
   * 16: System dissolved-CO2 sensor reading, where supplied
   *
   * For 30 Hz, column 12 is ASSUMED at 8 kg.
   * For the other speeds, column 12 is weighed water mass.
   */

  const RAW_TESTS = {
    20: [
      [
        "13:25:19", 5, 55.552, 55.544,
        17.6, 14.8, 8.83, 6.57, 23, 23.9,
        1.1, 10, 10.53,
        0.037212514, 0.107239995
      ],
      [
        "13:35:12", 5, 55.532, 55.526,
        17.95, 14.95, 8.83, 6.59, 23, 24.2,
        1.1, 10, 10.61,
        0.043851567, 0.113879048
      ],
      [
        "13:44:04", 10, 55.51, 55.496,
        17.1, 15, 8.83, 5.96, 23, 24.3,
        1.2, 10, 10.01,
        0.175211978, 0.245239459
      ],
      [
        "13:52:19", 10, 55.492, 55.478,
        16.95, 14.9, 8.4, 5.95, 24.5, 24.6,
        1.2, 10, 10.08,
        0.175895784, 0.248546775
      ],
      [
        "13:58:50", 10, 55.474, 55.46,
        16.9, 14.85, 8.4, 5.96, 24.5, 24.2,
        1.2, 10, 10.29,
        0.172816778, 0.245467768
      ],
      [
        "14:07:20", 15, 55.438, 55.414,
        15.8, 14.7, 8.36, 5.74, 23.9, 24.5,
        1.2, 10, 9.18,
        0.284929833, 0.357819015
      ],
      [
        "14:12:39", 15, 55.412, 55.388,
        15.6, 14.7, 8.36, 5.72, 23.9, 24.5,
        1.2, 10, 9.93,
        0.298340572, 0.371229754
      ],
      [
        "14:17:30", 15, 55.386, 55.364,
        15.65, 14.75, 8.36, 5.75, 23.9, 24.8,
        1.2, 10, 9.15,
        0.277370162, 0.350259344
      ],
      [
        "14:25:43", 17, 55.334, 55.304,
        14.8, 14, 8.33, 5.75, 24.1, 24.7,
        1.3, 10, 8.84,
        0.277600436, 0.350618289
      ],
      [
        "14:31:03", 17, 55.302, 55.274,
        14.8, 14.25, 8.33, 5.77, 24.1, 24.8,
        1.3, 10, 8.65,
        0.264776494, 0.337794347
      ],
      [
        "14:35:53", 17, 55.272, 55.244,
        14.75, 14.6, 8.33, 5.75, 24.1, 24.8,
        1.3, 10, 8.67,
        0.277241492, 0.350259344
      ],
      [
        "14:44:46", 20, 55.206, 55.17,
        13.5, 15, 8.36, 5.67, 24.2, 24.7,
        1.2, 10, 8.26,
        0.333857238, 0.406725384
      ],
      [
        "14:49:42", 20, 55.168, 55.132,
        13.35, 14.5, 8.36, 5.7, 24.2, 25,
        1.2, 10, 8.18,
        0.310393289, 0.383261435
      ],
      [
        "14:54:12", 20, 55.13, 55.092,
        13.35, 14.25, 8.36, 5.7, 24.2, 24.9,
        1.2, 10, 7.9,
        0.310791306, 0.383659453
      ],
      [
        "15:02:10", 25, 55.046, 55,
        12.9, 14.5, 8.29, 5.72, 24.5, 24.9,
        1.2, 10, 7.81,
        0.296509199, 0.36968739
      ],
      [
        "15:07:03", 25, 54.998, 54.952,
        12.75, 14, 8.29, 5.74, 24.5, 24.7,
        1.2, 10, 7.68,
        0.283900049, 0.357078239
      ],
      [
        "15:11:55", 25, 54.95, 54.904,
        12.75, 14.5, 8.29, 5.75, 24.9, 24.9,
        1.2, 10, 7.65,
        0.276750815, 0.34990242
      ]
    ],

    /*
     * 30 Hz:
     * 8 kg water mass is ASSUMED for every collection.
     * System pH readings are retained separately from handheld pH.
     */

    30: [
      [
        null, 5, 62.18, 62.172,
        18.65, 22.56, 8.56, 6.33, 25.2, 26.4,
        2.6, 8, 8,
        0.073130129, 0.14485355,
        6.16
      ],
      [
        null, 5, 62.172, 62.168,
        18.8, 23.3, 8.56, 6.31, 25.2, 26.4,
        2.6, 8, 8,
        0.076490503, 0.148213924,
        6.22
      ],
      [
        null, 5, 62.166, 62.162,
        23.55, 18.8, 8.2, 6.31, 25.2, 26.4,
        2.6, 8, 8,
        0.074665351, 0.148213924,
        6.28
      ],
      [
        null, 10, 62.154, 62.146,
        22.4, 18.75, 8.23, 6.03, 27.2, 26.4,
        2.8, 8, 8,
        0.14255227, 0.215833072,
        6.08
      ],
      [
        null, 10, 62.144, 62.136,
        22.5, 18.7, 8.21, 6.07, 27, 26.4,
        2.6, 8, 8,
        0.129922012, 0.20330975,
        6.23
      ],
      [
        null, 15, 62.128, 62.116,
        21.95, 18.65, 8.18, 5.87, 27, 26.9,
        2.6, 8, 8,
        0.204499895, 0.278028028,
        6.01
      ],
      [
        null, 15, 62.114, 62.102,
        22.75, 18.35, 8.18, 5.85, 27, 27.3,
        2.6, 8, 8,
        0.213145583, 0.286673716,
        6.05
      ],
      [
        null, 17, 62.09, 62.072,
        23.1, 20.9, 8.17, 5.72, 27.6, 26.9,
        2.4, 8, 8,
        0.288943049, 0.362480161,
        5.72
      ],
      [
        null, 17, 62.07, 62.054,
        23.1, 18.6, 8.16, 5.76, 27.6, 26.9,
        2.2, 8, 8,
        0.263445734, 0.337029908,
        5.79
      ],
      [
        null, 20, 62.038, 62.016,
        22.3, 19.55, 8.11, 5.67, 26.9, 27.2,
        2.2, 8, 8,
        0.32278522, 0.396648595,
        5.77
      ],
      [
        null, 20, 62.016, 61.994,
        22.3, 19, 8.11, 5.72, 26.4, 26.4,
        2.3, 8, 8,
        0.287574901, 0.361468626,
        5.98
      ],
      [
        null, 25, 61.968, 61.94,
        20.85, 18.4, 8.12, 5.66, 27.3, 27,
        2.3, 8, 8,
        0.331165207, 0.404956761,
        5.62
      ],
      [
        "13:33", 25, 61.94, 61.912,
        21.3, 19.9, 8.12, 5.65, 27.4, 27,
        2.3, 8, 8,
        0.338901999, 0.412687418,
        5.68
      ]
    ],

    /*
     * 40 Hz:
     * Uses the corrected table supplied by the user.
     * The 13:24:20 total concentration is 0.242810724 g/L.
     */

    40: [
      [
        "12:52:58", 5, 61.196, 61.194,
        30, 24, 8.2, 6.8, 24.1, 25.7,
        4.6, 10, 12.44,
        0.024307012, 0.097924081,
        7.82, 1067
      ],
      [
        "13:00:09", 5, 61.188, 61.186,
        30, 24.2, 8.04, 6.75, 23.4, 25.9,
        4.6, 10, 12.44,
        0.026421029, 0.100828779,
        7.78, 1188
      ],
      [
        "13:07:13", 10, 61.174, 61.166,
        30, 23.5, 8.05, 6.22, 24.9, 25.5,
        4.6, 10, 11.5,
        0.092171051, 0.166441641,
        7.25, 2114
      ],
      [
        "13:14:50", 10, 61.16, 61.152,
        30, 23.5, 8.05, 6.29, 24.9, 25.6,
        4.6, 10, 11.69,
        0.078244976, 0.152515566,
        7.2, 817
      ],
      [
        "13:24:20", 15, 61.136, 61.122,
        28.8, 23, 7.86, 5.96, 24.4, 25.4,
        4.4, 10, 12.63,
        0.16748924, 0.242810724,
        6.87, 1543
      ],
      [
        "13:28:55", 15, 61.12, 61.104,
        28.8, 22.85, 7.86, 5.91, 24.4, 25,
        4.4, 10, 11.79,
        0.189122617, 0.264444102,
        6.76, 1319
      ],
      [
        "13:36:40", 17, 61.084, 61.064,
        28, 22.9, 7.77, 5.72, 25, 26.1,
        4.4, 10, 11.75,
        0.289397086, 0.365264642,
        5.57, 581
      ],
      [
        "13:44:01", 17, 61.06, 61.042,
        27.95, 22.6, 7.77, 5.74, 25, 26,
        4.2, 10, 11.04,
        0.276594734, 0.35246229,
        5.53, 553
      ],
      [
        "13:51:44", 20, 61.016, 60.99,
        27.3, 22.5, 7.63, 5.65, 25.3, 26.3,
        4.3, 10, 11.53,
        0.338568126, 0.41552317,
        6.33, 452
      ],
      [
        "13:58:12", 20, 60.988, 60.96,
        26.3, 22.2, 7.63, 5.62, 25.3, 26.4,
        4.3, 10, 11.68,
        0.362621415, 0.439576459,
        5.38, 419
      ],
      [
        "14:07:50", 25, 60.926, 60.892,
        26.3, 23.2, 7.85, 5.6, 27.3, 26.9,
        3.2, 10, 11.01,
        0.379377512, 0.454582926,
        5.32, 350.2
      ],
      [
        "14:16:28", 25, 60.89, 60.856,
        25.6, 22.95, 7.85, 5.55, 27.3, 26.9,
        3.2, 10, 10.74,
        0.425957039, 0.501162453,
        5.29, 337
      ]
    ],

    50: [
      [
        "08:57:06", 5, 57.98, 57.976,
        29.35, 24.5, 8.66, 6.9, 24.4, 25.2,
        4.4, 10, 10.79,
        0.02187416481282, 0.09303648043797
      ],
      [
        "09:06:22", 5, 57.97, 57.966,
        29.3, 25, 8.66, 6.9, 24.4, 25.5,
        4.2, 10, 10.59,
        0.02179455995781, 0.09295687558296
      ],
      [
        "09:15:31", 10, 57.954, 57.944,
        29.25, 23.7, 8.38, 6.37, 24.4, 25.4,
        4.4, 10, 10.71,
        0.06664486499008, 0.1394018109416
      ],
      [
        "09:23:07", 10, 57.94, 57.93,
        29.25, 24.6, 8.47, 6.37, 24.9, 25.7,
        4.6, 10, 10.39,
        0.06689133135317, 0.139150424622
      ],
      [
        "09:29:41", 10, 57.926, 57.916,
        29.5, 24.65, 8.47, 6.34, 24.9, 25.9,
        4.6, 10, 10.19,
        0.07140499179112, 0.14366408506
      ],
      [
        "09:39:52", 15, 57.898, 57.884,
        29.5, 24.3, 8.37, 6.09, 24.9, 26,
        4.4, 10, 10.5,
        0.1253067456636, 0.198076650102
      ],
      [
        "09:51:13", 15, 57.878, 57.864,
        29.1, 24.5, 8.41, 6.07, 25.4, 26.5,
        4.6, 10, 10.58,
        0.1306193086792, 0.203152757481
      ],
      [
        "09:56:33", 15, 57.86, 57.846,
        29.25, 24, 8.41, 6.06, 25.4, 27.1,
        4.8, 10, 10.11,
        0.1487695050195, 0.221302953821
      ],
      [
        "10:14:09", 17, 57.778, 57.762,
        29.55, 24.1, 8.41, 5.97, 25.4, 26.6,
        4.8, 10, 10.34,
        0.1639958935986, 0.2365293424
      ],
      [
        "10:19:14", 17, 57.76, 57.746,
        29.4, 23.9, 8.41, 5.92, 25.4, 26.6,
        4.8, 10, 10.34,
        0.1838943223127, 0.256427771114
      ],
      [
        "10:25:15", 17, 57.742, 57.728,
        29.65, 24.05, 8.41, 5.95, 25.4, 26.5,
        4.6, 10, 10.54,
        0.1718862171828, 0.244419665985
      ],
      [
        "10:34:31", 20, 57.708, 57.688,
        29.5, 24.3, 8.25, 5.77, 25.4, 26.5,
        4.6, 10, 10.63,
        0.2589485944798, 0.332253487211
      ],
      [
        "10:38:49", 20, 57.686, 57.666,
        29, 24, 8.25, 5.77, 25.4, 26,
        4.8, 10, 10.68,
        0.2605229608175, 0.333827853549
      ],
      [
        "10:46:11", 20, 57.662, 57.642,
        29.15, 24.3, 8.14, 5.74, 26.7, 26.5,
        4.8, 10, 10.37,
        0.2770418429034, 0.35077597607
      ],
      [
        "10:54:00", 25, 57.616, 57.592,
        29.4, 23.8, 8.14, 5.75, 26.7, 27.5,
        5, 10, 10.26,
        0.267567233829, 0.341301366996
      ],
      [
        "10:59:54", 25, 57.59, 57.564,
        27.8, 23.7, 8.21, 5.67, 27.4, 27.5,
        4.8, 10, 10.26,
        0.322171994129, 0.395533866678
      ],
      [
        "11:05:12", 25, 57.562, 57.538,
        29.1, 24.45, 8.21, 5.69, 27.4, 27.5,
        4.4, 10, 9.68,
        0.3076607941458, 0.381022666695
      ]
    ]
  };

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

  function completeNumericValues(records, field) {
    const values = records.map((record) => record[field]);

    return values.every(Number.isFinite) ? values : null;
  }

  function makeRecord(speed, row, index) {
    const [
      time,
      flow,
      cylinderBefore,
      cylinderAfter,
      waterFlow1,
      waterFlow2,
      inletPh,
      outletPh,
      inletTemp,
      outletTemp,
      pressure,
      waterSetpoint,
      waterKg,
      uptake,
      totalCo2,
      systemPh,
      systemDco2Reading
    ] = row;

    const waterMassAssumed = speed === 30;

    /*
     * Round the cylinder difference to remove floating-point
     * subtraction noise. The recorded cylinder weights remain
     * unchanged in the record.
     */
    const co2Grams = Number(
      ((cylinderBefore - cylinderAfter) * 1000).toFixed(6)
    );

    const waterLitres = waterKg / WATER_DENSITY_KG_L;

    const uptakeGrams = uptake * waterLitres;
    const totalCo2Grams = totalCo2 * waterLitres;

    const efficiency = co2Grams > 0
      ? uptakeGrams / co2Grams * 100
      : undefined;

    const record = {
      runId: `${speed}Hz-${String(index + 1).padStart(2, "0")}`,
      speed,
      time,
      flow,

      cylinderBefore,
      cylinderAfter,
      co2Grams,

      waterFlow1,
      waterFlow2,

      inletPh,
      outletPh,
      inletTemp,
      outletTemp,
      pressure,

      waterSetpoint,

      /*
       * waterKg is the mass used in calculations.
       * Check waterMassBasis before describing it as measured.
       */
      waterKg,
      waterLitres,

      waterMassAssumed,
      waterMassBasis: waterMassAssumed ? "assumed" : "weighed",

      /*
       * No independently weighed mass is assigned at 30 Hz.
       */
      measuredWaterKg: waterMassAssumed ? null : waterKg,

      uptake,
      totalCo2,
      uptakeGrams,
      totalCo2Grams,
      efficiency,

      sourceType: "individual-repeats"
    };

    if (Number.isFinite(systemPh)) {
      record.systemPh = systemPh;
    }

    if (Number.isFinite(systemDco2Reading)) {
      record.systemDco2Reading = systemDco2Reading;
    }

    /*
     * An assumed 8 kg mass cannot demonstrate that the
     * system delivered exactly the 8 kg setpoint.
     */
    if (!waterMassAssumed && waterSetpoint > 0) {
      record.waterDeviationPercent =
        (waterKg - waterSetpoint) / waterSetpoint * 100;
    }

    return record;
  }

  function summariseRepeats(speed, flow, repeats) {
    const waterMassAssumed = repeats.some(
      (repeat) => repeat.waterMassAssumed
    );

    const result = {
      speed,
      flow,
      repeatCount: repeats.length,
      sourceType: "individual-repeats",

      waterMassAssumed,
      waterMassBasis: waterMassAssumed ? "assumed" : "weighed",

      repeats
    };

    const numericFields = [
      "uptake",
      "efficiency",
      "totalCo2",
      "waterKg",
      "waterLitres",
      "measuredWaterKg",
      "waterSetpoint",
      "co2Grams",
      "uptakeGrams",
      "totalCo2Grams",
      "waterFlow1",
      "waterFlow2",
      "inletPh",
      "outletPh",
      "inletTemp",
      "outletTemp",
      "pressure",
      "systemPh",
      "systemDco2Reading"
    ];

    for (const field of numericFields) {
      const values = completeNumericValues(repeats, field);

      if (values !== null) {
        result[field] = mean(values);
      }
    }

    /*
     * Keep measurement absence explicit at 30 Hz.
     */
    if (waterMassAssumed) {
      result.measuredWaterKg = null;
    }

    const spreadFields = [
      "uptake",
      "efficiency",
      "totalCo2",
      "waterKg",
      "co2Grams",
      "uptakeGrams",
      "waterFlow1",
      "waterFlow2"
    ];

    for (const field of spreadFields) {
      const values = completeNumericValues(repeats, field);

      if (values === null) continue;

      result[`${field}Min`] = Math.min(...values);
      result[`${field}Max`] = Math.max(...values);

      /*
       * Zero spread in the assumed 30 Hz water masses
       * is not presented as measured repeatability.
       */
      if (!(field === "waterKg" && waterMassAssumed)) {
        result[`${field}SD`] = sampleSD(values);
      }
    }

    /*
     * Preserve the original field names used by app.js.
     */
    result.uptakeMin = Math.min(
      ...repeats.map((repeat) => repeat.uptake)
    );

    result.uptakeMax = Math.max(
      ...repeats.map((repeat) => repeat.uptake)
    );

    result.efficiencyMin = Math.min(
      ...repeats.map((repeat) => repeat.efficiency)
    );

    result.efficiencyMax = Math.max(
      ...repeats.map((repeat) => repeat.efficiency)
    );

    if (
      !waterMassAssumed &&
      Number.isFinite(result.waterKg) &&
      Number.isFinite(result.waterSetpoint) &&
      result.waterSetpoint > 0
    ) {
      result.waterDeviationPercent =
        (
          (result.waterKg - result.waterSetpoint) /
          result.waterSetpoint
        ) * 100;
    }

    return result;
  }

  const individualResults = {};
  const results = {};

  for (const speed of SPEEDS) {
    const records = RAW_TESTS[speed].map(
      (row, index) => makeRecord(speed, row, index)
    );

    individualResults[speed] = records;

    results[speed] = FLOW_SETTINGS.map((flow) => {
      const repeats = records.filter(
        (record) => record.flow === flow
      );

      return summariseRepeats(speed, flow, repeats);
    });
  }

  window.RESULTS = results;
  window.INDIVIDUAL_RESULTS = individualResults;

  window.RESULTS_METADATA = {
    configuration: "Two parallel Venturi-static mixer branches",

    speeds: SPEEDS,
    flowSettings: FLOW_SETTINGS,
    waterDensityKgL: WATER_DENSITY_KG_L,

    totalIndividualTrials: Object.values(individualResults)
      .reduce((total, records) => total + records.length, 0),

    uptakeBasis:
      "PHREEQC-derived additional dissolved CO2 above " +
      "the untreated-water baseline",

    totalCo2Basis:
      "Total dissolved inorganic carbon expressed as CO2 equivalent",

    efficiencyBasis:
      "Additional dissolved CO2 mass divided by cylinder mass loss, " +
      "multiplied by 100. At 30 Hz, dissolved mass uses the " +
      "assumed 8 kg water collection.",

    averagingBasis:
      "Arithmetic means calculated from individual trials " +
      "at each CO2 flowmeter setting",

    repeatSpreadBasis:
      "Sample standard deviation of individual trial values",

    sources: {
      20: "17 individual trials from the user-supplied 20 Hz table",
      30:
        "13 individual trials from the user-supplied 30 Hz table; " +
        "8 kg water mass assumed per collection",
      40:
        "12 individual trials from the corrected " +
        "user-supplied 40 Hz table",
      50: "17 individual trials from the original 50HZ.xlsx workbook"
    },

    waterMassBasis: {
      20: {
        type: "weighed",
        label: "Independently weighed collected water",
        assumption: null
      },

      30: {
        type: "assumed",
        label: "Assumed collected water: 8 kg",
        assumption:
          "Collected water was not independently recorded on the " +
          "scale during these trials. The user authorised an " +
          "8 kg assumption per collection."
      },

      40: {
        type: "weighed",
        label: "Independently weighed collected water",
        assumption: null
      },

      50: {
        type: "weighed",
        label: "Independently weighed collected water",
        assumption: null
      }
    },

    availability: {
      20: {
        individualRepeats: true,
        separateWaterFlowmeters: true,
        collectedWaterMass: true,
        assumedWaterMass: false,
        waterSetpoint: true,
        cylinderMassLoss: true,
        totalCo2: true,
        handheldPh: true,
        temperature: true,
        recordedPressure: true,
        systemPh: false,
        systemDco2Reading: false
      },

      30: {
        individualRepeats: true,
        separateWaterFlowmeters: true,
        collectedWaterMass: false,
        assumedWaterMass: true,
        waterSetpoint: true,
        cylinderMassLoss: true,
        totalCo2: true,
        handheldPh: true,
        temperature: true,
        recordedPressure: true,
        systemPh: true,
        systemDco2Reading: false
      },

      40: {
        individualRepeats: true,
        separateWaterFlowmeters: true,
        collectedWaterMass: true,
        assumedWaterMass: false,
        waterSetpoint: true,
        cylinderMassLoss: true,
        totalCo2: true,
        handheldPh: true,
        temperature: true,
        recordedPressure: true,
        systemPh: true,
        systemDco2Reading: true
      },

      50: {
        individualRepeats: true,
        separateWaterFlowmeters: true,
        collectedWaterMass: true,
        assumedWaterMass: false,
        waterSetpoint: true,
        cylinderMassLoss: true,
        totalCo2: true,
        handheldPh: true,
        temperature: true,
        recordedPressure: true,
        systemPh: false,
        systemDco2Reading: false
      }
    },

    units: {
      speed: "Hz",
      flow: "L/min",
      cylinderBefore: "kg",
      cylinderAfter: "kg",
      co2Grams: "g",
      waterFlow1: "L/min indicated",
      waterFlow2: "L/min indicated",
      waterKg: "kg; check waterMassBasis",
      measuredWaterKg: "kg weighed",
      waterLitres: "L, using 1 kg/L",
      waterSetpoint: "kg",
      uptake: "g/L as CO2 equivalent",
      totalCo2: "g/L as CO2 equivalent",
      uptakeGrams: "g as CO2 equivalent",
      totalCo2Grams: "g as CO2 equivalent",
      efficiency: "%",
      waterDeviationPercent: "%",
      temperature: "degrees C",
      pressure: "bar; reference not confirmed",
      systemDco2Reading: "Recorded display value; units not confirmed"
    },

    notes: [
      "All four speeds now contain individual trial records.",
      "Setting means are recalculated from those individual records.",
      "CO2 flow values represent flowmeter settings.",
      "Cylinder mass loss provides supplied CO2 mass.",
      "Point 1 and Point 2 readings remain as recorded.",
      "No upstream/downstream readings are automatically swapped.",
      "Water mass is converted to approximate volume using 1 kg/L.",
      "30 Hz water mass is assumed at 8 kg per collection.",
      "30 Hz delivery accuracy cannot be verified from that assumption.",
      "30 Hz dissolved masses and efficiencies use the assumed volume.",
      "40 Hz uses the corrected table supplied by the user.",
      "Gas interference in downstream metering is suspected, not confirmed.",
      "Recorded sensor values are not treated as calibrated reference data.",
      "Missing timestamps are left unavailable.",
      "Timestamps are not used as collection durations.",
      "No universal good-performance threshold is assigned.",
      "Delivered dissolved CO2 is separate from mineralised CO2.",
      "Small differences from earlier rounded summaries may occur."
    ]
  };
})();