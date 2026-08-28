/**
 * What the landing page offers a reader who has not typed anything yet.
 *
 * The four quick links are fixed — they are the shape of the documentation,
 * not a ranking. Each path is a page inside the help zips of the install.
 */
import { localIconUrl } from "@/lib/icons";

export interface QuickLink {
  title: string;
  description: string;
  /** Help path, as `bin` reads it: `nodes/index`. */
  path: string;
  icon: string;
}

export const QUICK_LINKS: QuickLink[] = [
  {
    title: "Index",
    description: "Get started with Houdini",
    path: "basics/index",
    icon: localIconUrl("MISC/logo.svg"),
  },
  {
    title: "Nodes",
    description: "SOP · DOP · LOP · VOP",
    path: "nodes/index",
    icon: localIconUrl("NETWORKS/sop.svg"),
  },
  {
    title: "VEX",
    description: "Functions & language",
    path: "vex/functions/index",
    icon: localIconUrl("SOP/attribwrangle.svg"),
  },
  {
    title: "Python",
    description: "HOM API reference",
    path: "hom/index",
    icon: localIconUrl("MISC/python.svg"),
  },
];
