(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RestaurantAlgorithms = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_SEED = 20261124;
  var MAX_BENCHMARK_SIZE = 10000;
  var clock = typeof performance !== "undefined" && typeof performance.now === "function"
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  function checkSortArguments(items, comparator) {
    if (!Array.isArray(items)) throw new TypeError("정렬할 데이터는 배열이어야 합니다.");
    if (typeof comparator !== "function") throw new TypeError("비교 함수를 전달해 주세요.");
  }

  function resetMetrics(options) {
    if (!options || !options.metrics) return null;
    var metrics = options.metrics;
    if (typeof metrics !== "object" || Array.isArray(metrics)) {
      throw new TypeError("metrics는 객체여야 합니다.");
    }
    metrics.comparisons = 0;
    metrics.writes = 0;
    return metrics;
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function compareIds(a, b) {
    var left = text(a && a.id);
    var right = text(b && b.id);
    return left < right ? -1 : left > right ? 1 : 0;
  }

  /**
   * Korean text comparison, with an ascending ID fallback for equal values.
   * addedAt, date and visitedAt accept ISO dates or numeric timestamps.
   * Set tieBreaker: false when testing the stability of equivalent records.
   */
  function createComparator(options) {
    options = options || {};
    var key = options.key || "name";
    var direction = options.direction || "asc";
    if (direction !== "asc" && direction !== "desc") {
      throw new RangeError("direction은 asc 또는 desc여야 합니다.");
    }
    var sign = direction === "desc" ? -1 : 1;
    var collator = new Intl.Collator(options.locale || "ko", {
      usage: "sort", numeric: true, sensitivity: "base"
    });
    var dateKey = key === "addedAt" || key === "date" || key === "visitedAt";
    return function (a, b) {
      var left = a && a[key];
      var right = b && b[key];
      var compared;
      if (dateKey) {
        var leftTime = typeof left === "number" ? left : Date.parse(text(left));
        var rightTime = typeof right === "number" ? right : Date.parse(text(right));
        compared = Number.isFinite(leftTime) && Number.isFinite(rightTime)
          ? (leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0)
          : collator.compare(text(left), text(right));
      } else if (typeof left === "number" && typeof right === "number"
          && Number.isFinite(left) && Number.isFinite(right)) {
        compared = left < right ? -1 : left > right ? 1 : 0;
      } else {
        compared = collator.compare(text(left), text(right));
      }
      if (compared !== 0) return sign * compared;
      return options.tieBreaker === false ? 0 : compareIds(a, b);
    };
  }

  // The ordinary sort has no metrics counters. Benchmarks use this path.
  function mergePlain(items, comparator) {
    if (items.length <= 1) return items.slice();
    var middle = Math.floor(items.length / 2);
    var left = mergePlain(items.slice(0, middle), comparator);
    var right = mergePlain(items.slice(middle), comparator);
    var result = new Array(items.length);
    var i = 0;
    var j = 0;
    var out = 0;
    while (i < left.length && j < right.length) {
      // Taking the left record on equality preserves the original tie order.
      result[out++] = comparator(left[i], right[j]) <= 0 ? left[i++] : right[j++];
    }
    while (i < left.length) result[out++] = left[i++];
    while (j < right.length) result[out++] = right[j++];
    return result;
  }

  function mergeCounted(items, comparator, metrics) {
    if (items.length <= 1) return items.slice();
    var middle = Math.floor(items.length / 2);
    var left = mergeCounted(items.slice(0, middle), comparator, metrics);
    var right = mergeCounted(items.slice(middle), comparator, metrics);
    var result = new Array(items.length);
    var i = 0;
    var j = 0;
    var out = 0;
    while (i < left.length && j < right.length) {
      metrics.comparisons += 1;
      result[out++] = comparator(left[i], right[j]) <= 0 ? left[i++] : right[j++];
      metrics.writes += 1;
    }
    while (i < left.length) { result[out++] = left[i++]; metrics.writes += 1; }
    while (j < right.length) { result[out++] = right[j++]; metrics.writes += 1; }
    return result;
  }

  function mergeSort(items, comparator, options) {
    checkSortArguments(items, comparator);
    var metrics = resetMetrics(options);
    return metrics ? mergeCounted(items, comparator, metrics) : mergePlain(items, comparator);
  }

  function selectionPlain(items, comparator) {
    var result = items.slice();
    for (var i = 0; i < result.length - 1; i += 1) {
      var minimum = i;
      for (var j = i + 1; j < result.length; j += 1) {
        if (comparator(result[j], result[minimum]) < 0) minimum = j;
      }
      if (minimum !== i) {
        var previous = result[i];
        result[i] = result[minimum];
        result[minimum] = previous;
      }
    }
    return result;
  }

  function selectionCounted(items, comparator, metrics) {
    var result = items.slice();
    for (var i = 0; i < result.length - 1; i += 1) {
      var minimum = i;
      for (var j = i + 1; j < result.length; j += 1) {
        metrics.comparisons += 1;
        if (comparator(result[j], result[minimum]) < 0) minimum = j;
      }
      if (minimum !== i) {
        var previous = result[i];
        result[i] = result[minimum];
        result[minimum] = previous;
        metrics.writes += 2;
      }
    }
    return result;
  }

  function selectionSort(items, comparator, options) {
    checkSortArguments(items, comparator);
    var metrics = resetMetrics(options);
    return metrics ? selectionCounted(items, comparator, metrics) : selectionPlain(items, comparator);
  }

  function describe(items) {
    return {
      ids: items.map(function (item) { return text(item && item.id); }),
      names: items.map(function (item) {
        return text(item && (item.name != null ? item.name : item.id));
      })
    };
  }

  function mergeSortTrace(items, comparator) {
    checkSortArguments(items, comparator);
    var steps = [];
    function walk(part, depth) {
      var info = describe(part);
      if (part.length <= 1) {
        steps.push({
          type: "leaf", depth: depth, ids: info.ids, names: info.names,
          message: part.length ? info.names[0] + ": 한 항목이므로 그대로 둡니다." : "정렬할 항목이 없습니다."
        });
        return part.slice();
      }
      var middle = Math.floor(part.length / 2);
      var leftPart = part.slice(0, middle);
      var rightPart = part.slice(middle);
      var leftInfo = describe(leftPart);
      var rightInfo = describe(rightPart);
      steps.push({
        type: "split", depth: depth, ids: info.ids, names: info.names,
        leftIds: leftInfo.ids, rightIds: rightInfo.ids,
        leftNames: leftInfo.names, rightNames: rightInfo.names,
        message: info.names.join(" · ") + " 목록을 두 묶음으로 나눕니다."
      });
      var left = walk(leftPart, depth + 1);
      var right = walk(rightPart, depth + 1);
      var merged = [];
      var i = 0;
      var j = 0;
      while (i < left.length && j < right.length) {
        merged.push(comparator(left[i], right[j]) <= 0 ? left[i++] : right[j++]);
      }
      while (i < left.length) merged.push(left[i++]);
      while (j < right.length) merged.push(right[j++]);
      var mergedInfo = describe(merged);
      leftInfo = describe(left);
      rightInfo = describe(right);
      steps.push({
        type: "merge", depth: depth, ids: mergedInfo.ids, names: mergedInfo.names,
        leftIds: leftInfo.ids, rightIds: rightInfo.ids,
        leftNames: leftInfo.names, rightNames: rightInfo.names,
        message: "두 묶음의 앞 항목부터 비교해 합칩니다: " + mergedInfo.names.join(" → ")
      });
      return merged;
    }
    return { sorted: walk(items, 0), steps: steps };
  }

  function normalizeSeed(seed) {
    if (seed === undefined) return DEFAULT_SEED;
    if (typeof seed === "number" && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
    var value = text(seed);
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    var state = normalizeSeed(seed);
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var next = state;
      next = Math.imul(next ^ (next >>> 15), next | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function integerOption(value, fallback, name, minimum, maximum) {
    var answer = value === undefined ? fallback : value;
    if (!Number.isInteger(answer) || answer < minimum || answer > maximum) {
      throw new RangeError(name + " 값은 " + minimum + "부터 " + maximum + "까지의 정수여야 합니다.");
    }
    return answer;
  }

  /** Synthetic records only: no generated record represents a real visit. */
  function generateBenchmarkData(options) {
    options = options || {};
    var size = integerOption(options.size, 1000, "size", 0, MAX_BENCHMARK_SIZE);
    var order = options.order || "random";
    if (["random", "sorted", "reversed"].indexOf(order) === -1) {
      throw new RangeError("order는 random, sorted, reversed 중 하나여야 합니다.");
    }
    var random = seededRandom(options.seed);
    var words = ["가람", "나무", "다온", "라온", "마루", "바다", "사계", "아침", "자작", "차림", "하루"];
    var base = Date.UTC(2020, 0, 1);
    var data = [];
    for (var i = 0; i < size; i += 1) {
      var generatedDate = new Date(base + Math.floor(random() * 2000) * 86400000).toISOString().slice(0, 10);
      data.push({
        id: "TEST-" + String(i + 1).padStart(6, "0"),
        name: "TEST " + words[Math.floor(random() * words.length)] + " " + String(Math.floor(random() * 50) + 1).padStart(2, "0"),
        addedAt: generatedDate,
        date: generatedDate,
        synthetic: true,
        label: "TEST · 성능 비교용 생성 데이터"
      });
    }
    if (order === "random") {
      for (var at = data.length - 1; at > 0; at -= 1) {
        var picked = Math.floor(random() * (at + 1));
        var swap = data[at]; data[at] = data[picked]; data[picked] = swap;
      }
      return data;
    }
    var comparator = options.comparator || createComparator({
      key: options.key || "name", direction: options.direction || "asc"
    });
    data = mergeSort(data, comparator);
    if (order === "reversed") data.reverse();
    return data;
  }

  function median(values) {
    if (!values.length) throw new RangeError("측정값이 없습니다.");
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function checkResult(result, expected, comparator) {
    if (result.length !== expected.length) throw new Error("정렬 결과의 항목 수가 다릅니다.");
    for (var i = 0; i < result.length; i += 1) {
      if (text(result[i].id) !== text(expected[i].id)) throw new Error("두 알고리즘의 정렬 결과가 다릅니다.");
      if (i && comparator(result[i - 1], result[i]) > 0) throw new Error("정렬 결과의 순서가 올바르지 않습니다.");
    }
  }

  /**
   * Each timing gets a separate copy of the identical source data. Counts are
   * collected in separate runs, outside all timing samples. Algorithm order
   * alternates to reduce the effect of always running one algorithm first.
   */
  function benchmark(options) {
    options = options || {};
    var repeats = integerOption(options.repeats, 5, "repeats", 5, 31);
    var warmup = integerOption(options.warmup, 1, "warmup", 1, 5);
    var key = options.key || "name";
    var direction = options.direction || "asc";
    var comparator = options.comparator || createComparator({ key: key, direction: direction });
    var order = options.order || "random";
    var source = options.data ? options.data.slice() : generateBenchmarkData({
      size: options.size, seed: options.seed, order: order,
      key: key, direction: direction, comparator: comparator
    });
    checkSortArguments(source, comparator);
    if (source.length > MAX_BENCHMARK_SIZE) throw new RangeError("성능 비교는 최대 " + MAX_BENCHMARK_SIZE + "개까지 가능합니다.");
    var ids = new Set();
    source.forEach(function (item) {
      if (!item || item.id == null || ids.has(text(item.id))) {
        throw new Error("성능 비교 데이터에는 서로 다른 id가 필요합니다.");
      }
      ids.add(text(item.id));
    });
    // An ID fallback gives ties an identical, explicit order for both sorts.
    var baseComparator = comparator;
    comparator = function (a, b) { return baseComparator(a, b) || compareIds(a, b); };
    var expected = mergeSort(source, comparator);
    checkResult(expected, expected, comparator);
    var methods = { merge: mergeSort, selection: selectionSort };
    var samples = { merge: [], selection: [] };
    for (var run = 0; run < warmup + repeats; run += 1) {
      var sequence = run % 2 === 0 ? ["merge", "selection"] : ["selection", "merge"];
      sequence.forEach(function (name) {
        var independentInput = source.slice();
        var before = clock();
        var result = methods[name](independentInput, comparator);
        var elapsed = Math.max(0, clock() - before);
        checkResult(result, expected, comparator);
        if (!Number.isFinite(elapsed)) throw new Error("실행 시간을 측정할 수 없습니다.");
        if (run >= warmup) samples[name].push(elapsed);
      });
    }
    var report = {
      size: source.length, seed: normalizeSeed(options.seed), order: order,
      key: key, direction: direction, repeats: repeats, warmup: warmup,
      sameResult: true, generatedData: !options.data,
      metricsDefinition: "comparisons는 비교 함수 호출 수입니다. writes는 병합 결과 배열에 기록하거나 선택 정렬에서 원소를 교환할 때의 배열 기록 횟수이며, slice를 이용한 복사는 제외합니다."
    };
    ["merge", "selection"].forEach(function (name) {
      var metrics = {};
      var result = methods[name](source.slice(), comparator, { metrics: metrics });
      checkResult(result, expected, comparator);
      report[name] = {
        medianMs: median(samples[name]), samplesMs: samples[name].slice(),
        comparisons: metrics.comparisons, writes: metrics.writes
      };
    });
    return report;
  }

  return Object.freeze({
    createComparator: createComparator,
    mergeSort: mergeSort,
    selectionSort: selectionSort,
    mergeSortTrace: mergeSortTrace,
    generateBenchmarkData: generateBenchmarkData,
    benchmark: benchmark,
    median: median
  });
});
