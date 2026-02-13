import React from 'react';
import Select from 'react-select';
import FilterSection from './FilterSection';

const customSelectComponents = {
  IndicatorSeparator: () => null
};

function FilterDrawer({
  mode,
  epics,
  selectedEpicId,
  setSelectedEpicId,
  statusNames,
  selectedStatusNames,
  setSelectedStatusNames,
  onSelectAllStatuses,
  dueMode,
  setDueMode,
  assignee,
  setAssignee,
  users,
  selectedPriorities,
  setSelectedPriorities,
  selectedTypes,
  setSelectedTypes,
  selectedCreatedBy,
  setSelectedCreatedBy,
  searchQuery,
  setSearchQuery,
  hideDone,
  setHideDone,
  epicSearch,
  setEpicSearch,
  epicStatusFilter,
  setEpicStatusFilter,
  epicAssigneeFilter,
  setEpicAssigneeFilter,
  epicBoardStatusNames,
  collapsed
}) {
  const toArray = (value) => (Array.isArray(value) ? value : []);
  const safeStatusNames = toArray(selectedStatusNames);
  const safeAssignee = toArray(assignee);
  const safePriorities = toArray(selectedPriorities);
  const safeTypes = toArray(selectedTypes);
  const safeCreatedBy = toArray(selectedCreatedBy);

  return (
    <aside className={collapsed ? "filters collapsed" : "filters"}>
      {!collapsed ? (
        <>
          <div className="filtersTop">
            <div className="filtersTopTitle">Filters</div>
          </div>

          {mode === 'epics' ? (
            <>
              <FilterSection title="Search">
                <div className="filtersInputRow">
                  <input
                    className="detailsInput"
                    value={epicSearch}
                    onChange={(e) => setEpicSearch(e.target.value)}
                    placeholder="Search epics..."
                  />
                </div>
              </FilterSection>

              <FilterSection title="View">
                <div className="filtersList">
                  <label className={hideDone ? 'filterItem checked' : 'filterItem'}>
                    <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                    <span className="filterName">Hide "Done"</span>
                  </label>
                </div>
              </FilterSection>

              <FilterSection title="Status">
                <div className="filtersInputRow">
                  <Select
                    className="filtersSelect"
                    classNamePrefix="select"
                    isClearable
                    placeholder="All statuses"
                    options={(epicBoardStatusNames || []).map(s => ({ value: s, label: s }))}
                    value={epicStatusFilter ? ({ value: epicStatusFilter, label: epicStatusFilter }) : null}
                    onChange={(opt) => setEpicStatusFilter(opt?.value || '')}
                  />
                </div>
              </FilterSection>

              <FilterSection title="Assigned">
                <div className="filtersInputRow">
                  <Select
                    className="filtersSelect"
                    classNamePrefix="select"
                    isClearable
                    placeholder="All assignees"
                    options={(users || []).map(u => ({ value: u.username, label: u.username }))}
                    value={epicAssigneeFilter ? ({ value: epicAssigneeFilter, label: epicAssigneeFilter }) : null}
                    onChange={(opt) => setEpicAssigneeFilter(opt?.value || '')}
                  />
                </div>
              </FilterSection>
            </>
          ) : (
            <>
              <FilterSection title="Search">
                <div className="filtersInputRow">
                  <input
                    className="detailsInput"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search title, description, comments..."
                  />
                </div>
              </FilterSection>

              <FilterSection title="View">
                <div className="filtersList">
                  <label className={hideDone ? 'filterItem checked' : 'filterItem'}>
                    <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                    <span className="filterName">Hide Done</span>
                  </label>
                  {mode === 'epics' ? null : (
                    <label className={dueMode === 'overdue' ? 'filterItem checked' : 'filterItem'}>
                      <input type="checkbox" checked={dueMode === 'overdue'} onChange={(e) => setDueMode(e.target.checked ? 'overdue' : 'all')} />
                      <span className="filterName">Show Only Overdue</span>
                    </label>
                  )}
                </div>
              </FilterSection>

              <FilterSection title="Epic">
                <div className="filtersInputRow">
                  <Select
                    className="filtersSelect"
                    classNamePrefix="select"
                    isClearable
                    placeholder="All epics"
                    options={(epics || []).map(e => ({ value: e.id, label: `${e.ticketNumber ? `TM-${e.ticketNumber} ` : ''}${e.title}` }))}
                    value={selectedEpicId ? ({ value: selectedEpicId, label: (() => { const e=((epics || []).find(e => e.id === selectedEpicId)); return e ? `${e.ticketNumber ? `TM-${e.ticketNumber} ` : ''}${e.title}` : ''; })() }) : null}
                    onChange={(opt) => setSelectedEpicId(opt?.value || '')}
                  />
                </div>
              </FilterSection>

              <FilterSection
                title="Status"
                actions={<button className="tiny" onClick={onSelectAllStatuses}>All</button>}
              >
                <div className="filtersInputRow">
                  <Select
                    isMulti
                    options={(statusNames || []).map(s => ({ value: s, label: s }))}
                    value={safeStatusNames.map(s => ({ value: s, label: s }))}
                    onChange={(selected) => setSelectedStatusNames(toArray(selected).map(s => s.value))}
                    className="filtersSelect"
                    classNamePrefix="select"
                    components={customSelectComponents}
                  />
                </div>
              </FilterSection>

              <FilterSection title="Due">
                <div className="filtersList">
                  {[['all', 'All'], ['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['none', 'No due date']].map(([v, label]) => (
                    <label key={v} className={dueMode === v ? 'filterItem checked' : 'filterItem'}>
                      <input type="radio" name="due" checked={dueMode === v} onChange={() => setDueMode(v)} />
                      <span className="filterName">{label}</span>
                    </label>
                  ))}
                </div>
              </FilterSection>

              <FilterSection title="Assigned">
                <div className="filtersInputRow">
                  <Select
                    isMulti
                    options={(users || []).map(u => ({ value: u.username, label: u.username }))}
                    value={safeAssignee}
                    onChange={(selected) => setAssignee(toArray(selected))}
                    className="filtersSelect"
                    classNamePrefix="select"
                    components={customSelectComponents}
                  />
                </div>
              </FilterSection>

              <FilterSection title="Priority">
                <div className="filtersInputRow">
                  <Select
                    isMulti
                    options={[{ value: 'low', label: 'low' }, { value: 'medium', label: 'medium' }, { value: 'high', label: 'high' }]}
                    value={safePriorities}
                    onChange={(selected) => setSelectedPriorities(toArray(selected))}
                    className="filtersSelect"
                    classNamePrefix="select"
                    components={customSelectComponents}
                  />
                </div>
              </FilterSection>

              <FilterSection title="Type">
                <div className="filtersInputRow">
                  <Select
                    isMulti
                    options={[{ value: 'story', label: 'story' }, { value: 'bug', label: 'bug' }]}
                    value={safeTypes}
                    onChange={(selected) => setSelectedTypes(toArray(selected))}
                    className="filtersSelect"
                    classNamePrefix="select"
                    components={customSelectComponents}
                  />
                </div>
              </FilterSection>

              <FilterSection title="Created By">
                <div className="filtersInputRow">
                  <Select
                    isMulti
                    options={(users || []).map(u => ({ value: u.username, label: u.username }))}
                    value={safeCreatedBy}
                    onChange={(selected) => setSelectedCreatedBy(toArray(selected))}
                    className="filtersSelect"
                    classNamePrefix="select"
                    components={customSelectComponents}
                  />
                </div>
              </FilterSection>
            </>
          )}
        </>
      ) : null}
    </aside>
  );
}

export default FilterDrawer;
