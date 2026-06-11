(function initElectrodeCutBatchSort(global) {
  function getElectrodeCutBatchAvailabilityRank(batch) {
    if (!batch) return 99;

    const dryingEnd = batch.drying_end ?? batch.end_time ?? null;
    const dryingStart = batch.drying_start ?? batch.start_time ?? null;

    if (dryingEnd) return 0;
    if (dryingStart) return 1;
    return 2;
  }

  function getElectrodeCutBatchItemCreatedAtMs(batch) {
    const raw = batch?.item_created_at || batch?.created_at;
    if (!raw) return 0;

    const text = String(raw).trim();
    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, yearText, monthText, dayText] = dateOnlyMatch;
      return Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText));
    }

    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function compareElectrodeCutBatches(left, right, options = {}) {
    const selectedBatchId = options.selectedBatchId;

    if (selectedBatchId != null && selectedBatchId !== '') {
      const leftSelected = String(left?.cut_batch_id) === String(selectedBatchId);
      const rightSelected = String(right?.cut_batch_id) === String(selectedBatchId);
      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1;
      }
    }

    const rankDiff =
      getElectrodeCutBatchAvailabilityRank(left) -
      getElectrodeCutBatchAvailabilityRank(right);
    if (rankDiff !== 0) return rankDiff;

    const dateDiff =
      getElectrodeCutBatchItemCreatedAtMs(right) -
      getElectrodeCutBatchItemCreatedAtMs(left);
    if (dateDiff !== 0) return dateDiff;

    return Number(right?.cut_batch_id || 0) - Number(left?.cut_batch_id || 0);
  }

  function sortElectrodeCutBatches(batches, options = {}) {
    return (Array.isArray(batches) ? batches : [])
      .slice()
      .sort((left, right) => compareElectrodeCutBatches(left, right, options));
  }

  global.BADB_ELECTRODE_CUT_BATCH_SORT = {
    getElectrodeCutBatchAvailabilityRank,
    getElectrodeCutBatchItemCreatedAtMs,
    compareElectrodeCutBatches,
    sortElectrodeCutBatches
  };
})(window);
