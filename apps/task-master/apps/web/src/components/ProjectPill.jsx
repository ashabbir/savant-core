import React from 'react';
import { colorForProject, projectCode } from '../utils';

function ProjectPill({ project, projectName, projectId }) {
  const name = project?.name || projectName || 'Project';
  const code = project?.code || projectCode(name);
  const color = colorForProject(projectId || project?.id || name);

  return (
    <span className="projectPill">
      <span className="dot" style={{ background: color.solid }} />
      <span>{code}</span>
    </span>
  );
}

export default ProjectPill;
