import React from "react";

const Contact = () => {
  return (
    <div className="container">
      <h2 className="mt-12 text-center text-left font-secondary uppercase tracking-tight text-h2 text-balance max-lg:text-h6 my-3">
        Contact us
      </h2>
      <div className="flex flex-col md:flex-row gap-8 justify-between">
        <div className="flex-1">
          <div className="flex flex-col justify-center items-center my-8 gap-2">
            <img
              className="w-24 animate-border mb-2"
              src="/logo/logo.png"
              draggable="false"
            />
            <div className="font-bold text-p4">Token Tails</div>

            <div>Play to Save game</div>
          </div>
          <div className="flex gap-2 md:gap-8 justify-center">
            <a target="_blank" href="https://x.com/tokentails">
              <img
                className="w-12"
                src="/icons/social/x.png"
                draggable="false"
              />
            </a>
            <a
              target="_blank"
              href="https://instagram.com/tokentails"
            >
              <img
                className="w-12"
                src="/icons/social/instagram.png"
                draggable="false"
              />
            </a>
            <a target="_blank" href="mailto:hello@tokentails.com">
              <img
                className="w-12"
                src="/icons/social/email.png"
                draggable="false"
              />
            </a>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex flex-col justify-center items-center my-8 gap-2">
            <img
              className="w-24 animate-border mb-4"
              src="/icons/social/founder.jpg"
              draggable="false"
            />
            <div className="font-bold text-p4">Žygimantas Bagdzevicius</div>

            <div>Founder & CTO, Owner of 2 Cats</div>
          </div>
          <div className="flex gap-2 md:gap-8 justify-center">
            <a
              target="_blank"
              href="https://linkedin.com/in/zygimantas-bagdzevicius"
            >
              <img
                className="w-12"
                src="/icons/social/linkedin.png"
                draggable="false"
              />
            </a>
            <a target="_blank" href="https://x.com/zbagdz">
              <img
                className="w-12"
                src="/icons/social/x.png"
                draggable="false"
              />
            </a>
            <a
              target="_blank"
              href="https://instagram.com/zygimantas.bagdzevicius"
            >
              <img
                className="w-12"
                src="/icons/social/instagram.png"
                draggable="false"
              />
            </a>
            <a target="_blank" href="https://warpcast.com/skillmatrix">
              <img
                className="w-12"
                src="/icons/social/warpcast.png"
                draggable="false"
              />
            </a>
            <a target="_blank" href="mailto:zygimantas@skillmatrix.app">
              <img
                className="w-12"
                src="/icons/social/email.png"
                draggable="false"
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
