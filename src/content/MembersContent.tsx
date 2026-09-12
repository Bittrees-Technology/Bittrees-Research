import {Link} from "react-router";

export function MembersContent() {
    return (
        <div className="m-4 mx-auto max-w-xl">
            <div className="grid grid-cols-2 gap-6">
                <div className="text-left font-newtimesroman">
                    <ul className="max-w-md space-y-1 text-gray-400 list-disc list-outside ms-4 dark:text-gray-400 ">
                        {/*<li className="p-2">Gift Membership</li>*/}
                        <li className="p-2">
                            <a data-insights="navigate-etherscanio/token/0xc8121e650bd797d8b9dad00227a9a77ef603a84ac"
                                className="text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://etherscan.io/token/0xc8121e650bd797d8b9dad00227a9a77ef603a84a#code"
                            >
                                Membership Contract
                            </a>
                        </li>
                        <li className="p-2">
                            <Link
                                className="text-black no-underline hover:underline hover:text-green-700"
                                to="/mint-bnote"
                            >
                                <p>Mint BNOTE</p>
                                <p>(Bittrees Research Preferred Stock)</p>
                            </Link>
                        </li>
                        <li className="p-2">
                            <Link
                                className="text-black no-underline hover:underline hover:text-green-700"
                                to="/mint-bit"
                            >
                                <p>BIT Manager</p>
                                <p>(Lock/Unlock BNOTE)</p>
                            </Link>
                        </li>
                        <li className="p-2">
                            <a data-insights="navigate-etherscanio/address/0xf1aaffc982b5f553a730a9ec134715a547f1fe8"
                                className="block text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://etherscan.io/address/0xf1AAfFc982B5F553a730a9eC134715a547f1fe80#code"
                            >
                                BNOTE Contract on Ethereum
                            </a>
                            <a data-insights="navigate-basescanorg/address/0xf1aaffc982b5f553a730a9ec134715a547f1fe8"
                                className="block text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://basescan.org/address/0xf1AAfFc982B5F553a730a9eC134715a547f1fe80#code"
                            >
                                BNOTE Contract on Base
                            </a>
                        </li>

                        <li className="p-2">
                            <a data-insights="navigate-metaforoio/g/bittreesresearch"
                                className="text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://metaforo.io/g/bittreesresearch"
                            >
                                Governance Forum
                            </a>
                        </li>

                        <li className="p-2">
                            <a data-insights="navigate-snapshotbox//sresearchbittreeseth"
                                className="text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://snapshot.box/#/s:research.bittrees.eth"
                            >
                                Snapshot
                            </a>
                        </li>
                    </ul>
                </div>
                <div className="text-left font-newtimesroman">
                    <ul className="max-w-md space-y-1 text-gray-400 list-disc list-outside ms-4 dark:text-gray-400 ">
                        <li className="p-2">
                            <Link
                                className="text-black no-underline hover:underline hover:text-green-700"
                                to="/visionstatement"
                            >
                                Vision Statement
                            </Link>
                        </li>
                        <li className="p-2">
                            <Link
                                className="text-black no-underline hover:underline hover:text-green-700"
                                to="/codeofethics"
                            >
                                Code of Ethics
                            </Link>
                        </li>
                        <li className="p-2">
                            <a data-insights="navigate-docsgooglecom/document/d/1ncy1zhryfzpah9hrsqcmo6z3dftxtfwv1rx"
                                className="text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://docs.google.com/document/d/1ncY1zhrYFzpAh9hrSqCmO6z3dftXTfWV1RXHGHrTwlQ/edit"
                            >
                                Roadmap
                            </a>
                        </li>
                        <li className="p-2">
                            <a data-insights="navigate-docsgooglecom/drawings/d/1ayqj8boh7o8dcrhsbsutlvrs0fptoueioxq"
                                className="text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://docs.google.com/drawings/d/1_AYqj8boh7o8d_CrhSbSUtlvrs0fpTOUEIOxqGd_s58/"
                            >
                                Org Chart Diagram
                            </a>
                        </li>
                        <li className="p-2">
                            <a data-insights="navigate-guildxyz/bittrees-research"
                                className="text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://guild.xyz/bittrees-research"
                            >
                                Telegram
                            </a>
                        </li>
                        <li className="p-2">
                            <a data-insights="navigate-twittercom/bresearch"
                                className="text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://twitter.com/bresearch_"
                            >
                                Twitter
                            </a>
                        </li>
                        <li className="p-2">
                            <a data-insights="navigate-paragraphxyz/bresearch"
                                className="text-black no-underline hover:underline hover:text-green-700"
                                target="_blank"
                                rel="noreferrer"
                                href="https://paragraph.xyz/@bresearch"
                            >
                                Paragraph
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}