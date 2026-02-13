import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import ActivityDrawer from './ActivityDrawer';

test('renders ActivityDrawer agents section', () => {
  render(
    <ActivityDrawer
      agents={[{ id: 'a1', name: 'Jarvis', role: 'Lead', status: 'active' }]}
      selectedAgentId="a1"
      setSelectedAgentId={() => {}}
      rightSectionOpen="agents"
      setRightSectionOpen={() => {}}
      agentMessages={[]}
      agentMessageAuthor=""
      setAgentMessageAuthor={() => {}}
      agentMessageDraft=""
      setAgentMessageDraft={() => {}}
      onSendAgentMessage={() => {}}
      currentUser="amdsh"
      chatUsers={[]}
      assigneeOptions={[]}
      activityFeed={[]}
      activityActorFilter="all"
      setActivityActorFilter={() => {}}
      documents={[]}
      selectedDocId={null}
      setSelectedDocId={() => {}}
    />
  );

  expect(screen.getByText('Agents')).toBeInTheDocument();
  expect(screen.getByText('Jarvis')).toBeInTheDocument();
});
