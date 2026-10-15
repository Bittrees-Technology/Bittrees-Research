import {Link} from "react-router";
import { ContributorForm } from "@/components/ContributorForm";

export default function Contribute() {
  return <><p><Link to="/contributors/apply">Apply with email in the new contributor portal</Link></p><ContributorForm /></>;
}
