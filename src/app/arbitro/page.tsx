import {Suspense} from "react";
import {redirect} from "next/navigation";
import {currentUser} from "@/lib/server/auth";
import {getResultsScreen} from "@/lib/server/match-store";
import {ResultsManager} from "@/components/referee/results-manager";
async function RefereeContent(){const user=await currentUser();if(!user)redirect("/login");if(!user.is_admin||user.username.toLocaleLowerCase("it")!=="roberto")redirect("/classifica");return <ResultsManager initial={await getResultsScreen(user)}/>;}
export default function RefereePage(){return <Suspense fallback={<p role="status">Caricamento risultati…</p>}><RefereeContent/></Suspense>;}
