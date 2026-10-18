import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useAccount } from "wagmi";
import { ContributorForm } from "../components/ContributorForm";

export default function Contribute() {
  const { address, status } = useAccount();
  const navigate = useNavigate();
  const signingIn = useRef(status === "disconnected");

  // Connecting from this entry opens the member landing page. Navigation by
  // an already-connected member (including a restored session) keeps the form.
  useEffect(() => {
    if (status === "disconnected") signingIn.current = true;
    if (status === "connected" && signingIn.current) {
      signingIn.current = false;
      navigate("/", { replace: true });
    }
  }, [status, navigate]);

  return <ContributorForm key={address?.toLowerCase() || "disconnected"} />;
}
