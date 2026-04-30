export const EIGHT_D_STATUSES = {
  DRAFT: "draft",
  REVIEW: "review",
  CLOSED: "closed"
};

export const EIGHT_D_STEPS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"];

export const EIGHT_D_STEP_COLUMNS = {
  d1: "d1",
  d2: "d2",
  d3: "d3",
  d4: "d4",
  d5: "d5",
  d6: "d6",
  d7: "d7",
  d8: "d8"
};

export const EIGHT_D_TRANSITIONS = {
  draft: ["review"],
  review: ["draft", "closed"],
  closed: ["review"]
};

export const EIGHT_D_APPROVAL_DECISIONS = {
  APPROVED: "approved",
  REJECTED: "rejected"
};

export const VALID_EIGHT_D_STATUSES = new Set(Object.values(EIGHT_D_STATUSES));
export const VALID_EIGHT_D_STEPS = new Set(EIGHT_D_STEPS);
export const VALID_EIGHT_D_APPROVAL_DECISIONS = new Set(
  Object.values(EIGHT_D_APPROVAL_DECISIONS)
);
