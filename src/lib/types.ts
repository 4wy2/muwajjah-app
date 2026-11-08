export interface University {
  id: string;
  name: string;
  city: string;
  region: string;
  type: string;
  housing_status: string;
  housing_note: string;
  housing_source_url: string;
  housing_verified_on: string | null;
  description: string;
  website_url: string;
  logo_url: string;
  source_url: string;
  verified_on: string | null;
  published: boolean;
  deleted_at: string | null;
  created_at: string;
  legacy_key?: string;
}
export interface Program {
  id: string;
  university_id: string;
  name: string;
  college: string;
  degree: string;
  gender: string;
  campus: string;
  admission_route: string;
  published: boolean;
  deleted_at: string | null;
}
export interface Track {
  id: string;
  university_id: string;
  name: string;
  academic_year: string;
  gender: string;
  school_weight: number;
  aptitude_weight: number;
  achievement_weight: number;
  requirements: string;
  source_url: string;
  verified_on: string | null;
  published: boolean;
}
export interface Section {
  id: string;
  university_id: string;
  title: string;
  content: string;
  display_order: number;
  source_url: string;
  verified_on: string | null;
  feature_key: string;
}
export interface Cutoff {
  id: string;
  program_name: string;
  academic_year: string;
  gender: string;
  ratio: number;
  source_url: string;
  verified_on: string | null;
}
export interface Member {
  user_id: string;
  is_owner: boolean;
  is_enabled: boolean;
  can_edit: boolean;
  can_publish: boolean;
  can_delete: boolean;
}
export type FeatureState = "free" | "plus" | "locked" | "hidden";
export type ContentKind =
  | "universities"
  | "programs"
  | "tracks"
  | "sections"
  | "cutoffs";
export interface Favorite {
  id: string;
  user_id: string;
  university_id: string | null;
  program_id: string | null;
  created_at: string;
}
export interface Score {
  id: string;
  user_id: string;
  track_id: string;
  university_id: string;
  school: number;
  aptitude: number;
  achievement: number;
  result: number;
  created_at: string;
  // Filled by the server trigger from the published track/university.
  track_name?: string;
  university_name?: string;
}
export interface Row {
  id: string;
  [key: string]: unknown;
}
