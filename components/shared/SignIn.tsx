import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { ChangeEvent, useState } from "react";

const SignInForm = ({
  signIn,
}: {
  signIn: (username: string, password: string) => void;
}) => {
  const [username, setUsername] = useState("");
  const handleUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUsername(event?.target?.value);
  };
  const [password, setPassword] = useState("");
  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event?.target?.value);
  };

  const onSubmit = (e: any) => {
    e?.preventDefault?.();
    if (username?.length && password?.length > 5) signIn(username, password);
  };

  return (
    <form className="flex flex-col items-center gap-4" onSubmit={onSubmit}>
      <input
        type="text"
        placeholder="Email"
        className="outline-none bg-gray-100 hover:bg-gray-200 p2 px-8 rounded-full h-8 w-full max-w-60"
        onChange={handleUsernameChange}
        value={username}
      />
      <input
        placeholder="Password"
        className="outline-none bg-gray-100 hover:bg-gray-200 p2 px-8 rounded-full h-8 w-full max-w-60"
        onChange={handlePasswordChange}
        value={password}
        type="password"
      />
      <button
        onClick={onSubmit}
        className="group w-full max-w-60 m-auto h-10 px-6 rounded-full bg-blue-300"
        type="submit"
      >
        <div className="relative flex justify-between items-center space-x-4">
          <i className="bx bxs-key text-h6 text-blue-600"></i>
          <div className="flex items-center w-max tracking-wide whitespace-nowrap group-hover:text-gray-700 font-pixel">
            SIGN IN
          </div>
          <div></div>
        </div>
      </button>
    </form>
  );
};

export const SignInContent = () => {
  const { signIn, user } = useFirebaseAuth();

  return (
    <div className="pt-8 pb-4 px-4 md:px-16 md:py-8 text-gray-500 flex flex-col justify-between relative">
      <img className="w-16 m-auto mb-2" src="/logo/logo.webp" />
      {!user && (
        <div className="flex flex-col">
          <div className="text-center font-pixel text-p2 pb-2">
            WELCOME TO TOKEN TAILS
          </div>
          <button
            onClick={() => signIn("google")}
            className="group w-fit m-auto h-12 px-6 rounded-full mb-4 bg-yellow-300 hover:brightness-105"
          >
            <div className="relative flex justify-between items-center space-x-4">
              <i className="bx bxl-google text-h6 text-red-600"></i>
              <span className="block w-max font-semibold tracking-wide whitespace-nowrap group-hover:text-gray-700 font-pixel">
                SIGN IN WITH <span className="text-blue-600">G</span>
                <span className="text-red-600">o</span>
                <span className="text-yellow-600">o</span>
                <span className="text-blue-600">g</span>
                <span className="text-green-700">l</span>
                <span className="text-red-600">e</span>
              </span>
              <div></div>
            </div>
          </button>
          <button
            onClick={() => signIn("apple")}
            className="group w-fit m-auto h-12 px-7 bg-black rounded-full mb-2"
          >
            <div className="relative flex justify-between items-center space-x-4">
              <i className="bx bxl-apple text-h6 text-white"></i>
              <span className="block w-max font-semibold tracking-wide whitespace-nowrap group-hover:text-white text-primary-300 font-pixel">
                SIGN IN WITH <span className="text-white">Apple</span>
              </span>
              <div></div>
            </div>
          </button>

          <span className="md:hidden lg:block">
            <div className="my-2 text-center text-p4 font-bold font-pixel">
              OR
            </div>
            <SignInForm signIn={signIn} />
          </span>
          <div className="font-secondary m-auto mt-4">
            By signing-in you accept{" "}
            <a
              href="https://docs.tokentails.com/community-and-social-impact/terms-and-conditions"
              target="_blank"
              className="text-blue-700"
            >
              T&C
            </a>{" "}
            and{" "}
            <a
              href="https://docs.tokentails.com/community-and-social-impact/privacy-policy"
              target="_blank"
              className="text-blue-700"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      )}
      <img
        className="absolute bottom-0 right-2 h-8"
        src="/meme-cats/meme-23.gif"
      />
      <img
        className="absolute bottom-0 left-2 h-8"
        src="/meme-cats/meme-1.gif"
      />
      <img
        className="absolute top-2 left-2 h-12"
        src="/meme-cats/meme-46.gif"
      />
      <img
        className="absolute top-0 right-2 h-16"
        src="/meme-cats/meme-40.gif"
      />
    </div>
  );
};

export const SignIn = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full flex justify-center h-full z-20">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-white opacity-50"
      ></div>
      <div
        className="z-50 rem:w-[350px] md:w-[480px] max-w-full bg-white absolute top-1/2 -translate-y-1/2  rounded-lg shadow-2xl h-fit"
        style={{
          backgroundImage: "url(/base/bg-6.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <SignInContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
