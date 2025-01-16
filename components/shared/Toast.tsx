import { IToast } from '@/context/ToastContext';
import React from 'react';

export const Toast = ({ message, icon, isError }: IToast) => {
    return (
        <div className="fixed z-[110] top-32 left-1/2 " style={{ transform: 'translateX(-50%)' }}>
            <div
                className={`animate-bounceWithFade rem:w-[360px] min-h-10 px-2 rounded-lg shadow border-2 ${isError ? 'border-red-500' : 'border-purple-300'
                    } bg-yellow-300 flex items-center justify-center gap-4 text-main-black font-secondary`}
            >
                <img className='w-6' src="/logo/coin.webp" />
                <div>{message}</div>
                <img className='w-6' src="/logo/coin.webp" />
            </div>
        </div>
    );
};
