export function resolveEpicDoneMove({ taskType, currentColumnName, requestedColumnName, requestedOrder, columns, reviewMaxOrder }) {
  let nextColumnName = requestedColumnName;
  let nextOrder = requestedOrder;
  if (taskType === 'epic' && String(requestedColumnName).toLowerCase() === 'done') {
    const reviewColumn = (columns || []).find(c => c.enabled && String(c.name).toLowerCase() === 'review');
    const isCurrentlyInReview = reviewColumn && String(currentColumnName).toLowerCase() === String(reviewColumn.name).toLowerCase();

    if (reviewColumn && !isCurrentlyInReview) {
      nextColumnName = reviewColumn.name;
      nextOrder = (reviewMaxOrder ?? -1) + 1;
    }
  }
  return { columnName: nextColumnName, order: nextOrder };
}
