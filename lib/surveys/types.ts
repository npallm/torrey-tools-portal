export type QuestionType = "likert5" | "enps" | "single_choice" | "multi_choice" | "text";

export type SurveyQuestion = {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  /** Grouping for index scores, e.g. "Engagement", "Manager", "Growth". */
  dimension: string | null;
  options: string[];
  /** Likert items worded negatively; scored as 6 − value. */
  reverseScored: boolean;
  required: boolean;
};

/** Frozen at invite time so reorgs don't change historical results. */
export type RespondentAttributes = {
  division: string | null;
  department: string | null;
  location: string | null;
  workerType: string | null;
  tenureBand: string | null;
  /** Direct manager first, then up the chain. */
  managerChain: string[];
};

export type SurveyInvitation = { id: string; attributes: RespondentAttributes };

export type SurveyAnswer = {
  questionId: string;
  numericValue: number | null;
  choiceValues: string[];
  textValue: string | null;
};

export type SurveyResponse = { id: string; invitationId: string; submittedAt: string; answers: SurveyAnswer[] };

export type AttributeKey = "division" | "department" | "location" | "workerType" | "tenureBand";

export type SurveyFilter = Partial<Record<AttributeKey, string>> & { supOrgLeaderId?: string };
