"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addDevelopmentAction,
  addSuccessionCandidate,
  getSuccessionDashboard,
  removeSuccessionCandidate,
  saveTalentProfile,
  updateCriticalRole,
  updateSuccessionCandidate,
} from "@/lib/server/succession";

export async function addCandidateAction(formData: FormData) {
  const roleId = String(formData.get("roleId") ?? "");
  await addSuccessionCandidate({
    roleId, workerId: String(formData.get("workerId") ?? ""),
    readiness: String(formData.get("readiness") ?? "ready_3_plus_years") as "ready_now"|"ready_1_2_years"|"ready_3_plus_years",
    skillGaps: String(formData.get("skillGaps") ?? "").split(",").map((value)=>value.trim()).filter(Boolean),
    emergencyBackup: formData.get("emergencyBackup")==="on",
  });
  revalidatePath(`/succession/roles/${roleId}`);
}

export async function updateRoleAction(formData: FormData) {
  const roleId=String(formData.get("roleId")??"");
  await updateCriticalRole({roleId,impactOfLoss:Number(formData.get("impact")??3),probabilityOfLoss:Number(formData.get("probability")??3),rationale:String(formData.get("rationale")??"")});
  revalidatePath(`/succession/roles/${roleId}`);
}

export async function updateCandidateAction(formData: FormData) {
  const roleId=String(formData.get("roleId")??"");
  await updateSuccessionCandidate({candidateId:String(formData.get("candidateId")??""),roleId,readiness:String(formData.get("readiness")??"ready_3_plus_years") as "ready_now"|"ready_1_2_years"|"ready_3_plus_years",rank:Number(formData.get("rank")??1),skillGaps:String(formData.get("skillGaps")??"").split(",").map((v)=>v.trim()).filter(Boolean),emergencyBackup:formData.get("emergencyBackup")==="on",notes:String(formData.get("notes")??"")});
  revalidatePath(`/succession/roles/${roleId}`);
}

export async function removeCandidateAction(formData: FormData) {
  const roleId=String(formData.get("roleId")??"");
  await removeSuccessionCandidate(roleId,String(formData.get("candidateId")??""));
  revalidatePath(`/succession/roles/${roleId}`);
}

export async function addDevelopmentActionAction(formData: FormData) {
  const roleId=String(formData.get("roleId")??"")||null;
  await addDevelopmentAction({workerId:String(formData.get("workerId")??""),roleId,type:String(formData.get("type")??"experience") as "experience"|"exposure"|"education",title:String(formData.get("title")??""),dueDate:String(formData.get("dueDate")??"")||null});
  revalidatePath(roleId?`/succession/roles/${roleId}`:`/succession/people/${String(formData.get("workerId")??"")}`);
}

export async function saveProfileAction(formData: FormData) {
  const workerId=String(formData.get("workerId")??"");
  await saveTalentProfile({workerId,assessedOn:String(formData.get("assessedOn")??""),aspiration:Number(formData.get("aspiration")??2) as 1|2|3,ability:Number(formData.get("ability")??2) as 1|2|3,engagement:Number(formData.get("engagement")??2) as 1|2|3,flightRisk:String(formData.get("flightRisk")??"low") as "low"|"medium"|"high",impactOfLoss:String(formData.get("impactOfLoss")??"medium") as "low"|"medium"|"high",retirementWithin2Years:formData.get("retirementWithin2Years")==="on",openToRelocation:formData.get("openToRelocation")==="yes"?true:formData.get("openToRelocation")==="no"?false:null,careerInterests:String(formData.get("careerInterests")??""),skills:String(formData.get("skills")??"").split(",").map((v)=>v.trim()).filter(Boolean),notes:String(formData.get("notes")??"")});
  revalidatePath(`/succession/people/${workerId}`);
  revalidatePath("/succession");
}
