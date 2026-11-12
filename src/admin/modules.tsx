import { lazy, type ReactNode } from "react";
import {
  Building2,
  GraduationCap,
  Route,
  FileText,
  Percent,
  Upload,
  Users,
  ChartNoAxesCombined,
  Crown,
  History,
  ClipboardCheck,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { AdminAccess } from "./access";
const Content = lazy(() => import("./ContentManager"));
const Importer = lazy(() => import("./Importer"));
const Team = lazy(() => import("./Team"));
const Analytics = lazy(() => import("./Analytics"));
const Access = lazy(() => import("./Access"));
const Workspace = lazy(() => import("./UniversityWorkspace"));
const Audit = lazy(() => import("./Audit"));
const Readiness = lazy(() => import("./Readiness"));
const SiteHealth = lazy(() => import("./Health"));
export interface AdminModule {
  path: string;
  label: string;
  icon: LucideIcon;
  access: AdminAccess;
  element: ReactNode;
  // Routed but not listed in the sidebar (reached from another page).
  hidden?: boolean;
}
// Add a module once here: routes and navigation use the same registry.
export const adminModules: AdminModule[] = [
  {
    path: "health",
    label: "صحة الموقع",
    icon: Activity,
    access: "owner",
    element: <SiteHealth />,
  },
  {
    path: "readiness",
    label: "جاهزية البيانات",
    icon: ClipboardCheck,
    access: "member",
    element: <Readiness />,
  },
  {
    path: "universities",
    label: "الجامعات",
    icon: Building2,
    access: "member",
    element: <Content kind="universities" />,
  },
  {
    path: "universities/:id",
    label: "مساحة عمل الجامعة",
    icon: Building2,
    access: "member",
    element: <Workspace />,
    hidden: true,
  },
  {
    path: "programs",
    label: "التخصصات",
    icon: GraduationCap,
    access: "member",
    element: <Content kind="programs" />,
  },
  {
    path: "tracks",
    label: "مسارات القبول",
    icon: Route,
    access: "member",
    element: <Content kind="tracks" />,
  },
  {
    path: "sections",
    label: "الأقسام المرنة",
    icon: FileText,
    access: "member",
    element: <Content kind="sections" />,
  },
  {
    path: "cutoffs",
    label: "النسب السابقة",
    icon: Percent,
    access: "member",
    element: <Content kind="cutoffs" />,
  },
  {
    path: "import",
    label: "استيراد البيانات",
    icon: Upload,
    access: "editor",
    element: <Importer />,
  },
  {
    path: "team",
    label: "الفريق والصلاحيات",
    icon: Users,
    access: "owner",
    element: <Team />,
  },
  {
    path: "audit",
    label: "سجل التغييرات",
    icon: History,
    access: "owner",
    element: <Audit />,
  },
  {
    path: "analytics",
    label: "التحليلات",
    icon: ChartNoAxesCombined,
    access: "owner",
    element: <Analytics />,
  },
  {
    path: "access",
    label: "بلس والوصول",
    icon: Crown,
    access: "owner",
    element: <Access />,
  },
];
