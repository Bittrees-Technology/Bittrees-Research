import {useAccount} from "wagmi";
import {ContributorForm} from "../components/ContributorForm";
export default function Contribute(){const {address}=useAccount();return <ContributorForm key={address?.toLowerCase()||"disconnected"}/>;}
