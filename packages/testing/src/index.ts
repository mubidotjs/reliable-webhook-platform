export interface WorkspaceFixture {
  id: string;
  name: string;
  ownerId: string;
}

export function buildWorkspaceFixture(
  overrides: Partial<WorkspaceFixture> = {},
): WorkspaceFixture {
  return {
    id: "workspace_test",
    name: "Delivery Lab",
    ownerId: "user_test",
    ...overrides,
  };
}
