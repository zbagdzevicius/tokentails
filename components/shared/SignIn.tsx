import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { ChangeEvent, useState } from "react";

const features = ["Meowgical cats", "Purrfect gameplay", "Pawtastic"];

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
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <input
        type="text"
        placeholder="Email"
        className="outline-none bg-gray-100 hover:bg-gray-200 p2 px-8 rounded-full h-10 w-full"
        onChange={handleUsernameChange}
        value={username}
      />
      <input
        placeholder="Password"
        className="outline-none bg-gray-100 hover:bg-gray-200 p2 px-8 rounded-full h-10 w-full"
        onChange={handlePasswordChange}
        value={password}
        type="password"
      />
      <button
        onClick={onSubmit}
        className="group w-full h-12 px-6 border-2 border-gray-300 hover:border-gray-400 rounded-full"
        type="submit"
      >
        <div className="relative flex justify-between items-center space-x-4">
          <i className="bx bxs-key text-h6 text-blue-600"></i>
          <div className="flex items-center w-max font-semibold tracking-wide whitespace-nowrap group-hover:text-gray-700">
            Sign In / Register
          </div>
          <div></div>
        </div>
      </button>
    </form>
  );
};

export const SignInContent = () => {
  const { signIn, logout, user } = useFirebaseAuth();

  return (
    <div className="pt-8 pb-4 px-4 md:px-16 md:py-12 text-gray-500 flex flex-col justify-between">
      <img className="w-16 m-auto mb-8" src="/logo/logo.webp" />
      {!user && (
        <div>
          <SignInForm signIn={signIn} />
          <div className="my-4 text-center text-p3 font-bold">OR</div>
          <button
            onClick={() => signIn("google")}
            className="group w-full h-12 px-6 border-2 border-gray-300 hover:border-gray-400 rounded-full mb-4"
          >
            <div className="relative flex justify-between items-center space-x-4">
              <i className="bx bxl-google text-h6 text-red-600"></i>
              <span className="block w-max font-semibold tracking-wide whitespace-nowrap group-hover:text-gray-700">
                Sign in with <span className="text-blue-600">G</span>
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
            className="group w-full h-12 px-6 border-2 bg-black border-gray-300 hover:border-gray-400 rounded-full mb-4"
          >
            <div className="relative flex justify-between items-center space-x-4">
              <i className="bx bxl-apple text-h6 text-white"></i>
              <span className="block w-max font-semibold tracking-wide whitespace-nowrap group-hover:text-white text-primary-300">
                Login with <span className="text-white">Apple</span>
              </span>
              <div></div>
            </div>
          </button>
        </div>
      )}
      <ul className="m-auto">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/coin.webp" />
            <div>{feature}</div>
          </li>
        ))}
      </ul>
      {user && (
        <button className="text-black" onClick={logout}>
          Logout
        </button>
      )}
    </div>
  );
};

export const SignIn = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-white absolute top-[7rem] md:top-[9rem] rounded-lg shadow h-fit">
        <SignInContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
