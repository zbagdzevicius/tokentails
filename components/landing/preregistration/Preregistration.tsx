import React, { useState } from "react";
import {
  GoogleFormProvider,
  useGoogleForm,
  useShortAnswerInput,
} from "react-google-forms-hooks";

const form: any = {
  fvv: 1,
  pageHistory: 0,
  fbzx: "921818960314302375",
  action: "e/1FAIpQLSdsfumcbOyYNDGAAaBODCM3PzAZJlXdyGG0s0cleRWlxR81AQ",
  title: "TokenTails pre-registration",
  description: null,
  fields: [
    {
      label: "email",
      description: null,
      type: "SHORT_ANSWER",
      id: "1130409291",
      required: true,
    },
  ],
  fieldsOrder: { "1130409291": 0 },
};

const ShortAnswerInput = ({ id }: { id: string }) => {
  const { register, label } = useShortAnswerInput(id);

  return (
    <input
      className="[clip-path:polygon(0%_0%,100%_0%,96%_100%,0%_100%)] w-56 md:w-[360px] rounded-l placeholder:text-gray-100 px-4 md:px-8 text-p5 md:text-p4 bg-gradient-to-r from-main-ember to-main-rusty outline-none h-12 md:h-16 text-white"
      placeholder="Sign Up for Early Access"
      type="text"
      {...register()}
    />
  );
};

const Preregistration = () => {
  const methods = useGoogleForm({ form });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const onSubmit = async (data: any) => {
    await methods.submitToGoogleForms(data);
    setIsSubmitted(true);
  };

  return (
    <GoogleFormProvider {...methods}>
      {!isSubmitted && (
        <form
          id="preregistration"
          className="container flex justify-center pt-8"
          onSubmit={methods.handleSubmit(onSubmit)}
        >
          <ShortAnswerInput id="1130409291" />
          <span className="[clip-path:polygon(8%_0%,100%_0%,100%_100%,0%_100%)] flex items-center justify-center bg-gradient-to-r from-main-ember to-main-rusty rounded w-32 h-12 md:h-16 max-lg:w-24">
            <button
              type="submit"
              className="relative [clip-path:polygon(8%_0%,100%_0%,100%_100%,0%_100%)] bg-[#02020a] rounded w-[125px] h-[64px] max-lg:w-[94px]"
            >
              <span className="text-center text-p5 md:text-p4 text-white">
                Sign Up
              </span>
              <img
                className="absolute right-0 top-4"
                src="/cats/grey/Running-Clothed-Grey.gif"
              />
            </button>
          </span>
        </form>
      )}
      {isSubmitted && (
        <div className="pt-8 justify-center flex items-center container max-w-xl uppercase">
          <div>
            Your email has been registered, soon we are going to reach you out !
          </div>
          <img src="/cats/grey/Sitting-Clothed-Grey.gif" />
        </div>
      )}
    </GoogleFormProvider>
  );
};

export default Preregistration;
