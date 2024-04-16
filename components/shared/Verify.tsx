import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

export const VerifyContent = () => {
    const { showSignInPopup } = useFirebaseAuth();

    return (
        <div className="pt-8 pb-4 px-4 md:px-16 md:py-12 text-gray-500 flex flex-col justify-between">
            <h2 className="text-h6 text-center mb-4">Email confirmation</h2>
            <p className="mb-8 text-center">
                We sent you an email confirmation with a link to activate your account. Activate your account to continue
            </p>
            <button onClick={showSignInPopup}>
                <span>I confirmed</span>
            </button>
        </div>
    );
};

export const Verify = ({ close }: { close: () => void }) => {
    return (
        <div className="fixed inset-0 w-full z-50 flex justify-center rounded-md h-full">
            <div
                onClick={close}
                className="z-40 h-full w-full absolute inset-0 bg-white opacity-[0.75]"
            ></div>
            <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-white absolute top-[7rem] md:top-[9rem] rounded-lg shadow h-fit">
                <VerifyContent />
                <button onClick={close} className="absolute right-[0] top-0 group">
                    <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
                </button>
            </div>
        </div>
    );
};
