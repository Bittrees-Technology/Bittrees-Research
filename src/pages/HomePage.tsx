import {Link} from "react-router";
import BackArrow from "@/components/BackArrow.tsx";
import {useSetLayoutData} from "@/hooks/useSetLayoutData.tsx";

function HomePage() {
    useSetLayoutData({
        showBackButton: false,
    });

    return (
        <div className="flex flex-col gap-6 p-6">
            <Link to="/mint" className="flex flex-col items-center">
                <div className="mx-auto border border-black p-4 w-80 h-64 flex flex-col justify-center items-center shadow-md shadow-gray-500 hover:shadow-black">
                    <div className="text-xl">Become a Member</div>
                </div>
            </Link>
            <Link to="/members" className="flex flex-col items-center">
                <div
                    className="mx-auto border border-black p-4 w-80 h-64 flex flex-col justify-center items-center shadow-md shadow-gray-500 hover:shadow-black">
                    <div className="text-xl">Members Portal</div>
                </div>
            </Link>
            <footer className="flex flex-col gap-6 mx-auto mt-4">
            <span>
              <a data-insights="navigate-bittreesorg/" className="hover:text-green-700" href="https://bittrees.org">
                <BackArrow />
                <span className="inline-block align-middle underline font-bold font-newtimesroman">
                  Bittrees Home
                </span>
              </a>
            </span>
            </footer>
        </div>
    );
}

export default HomePage;