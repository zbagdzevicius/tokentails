import React from 'react';


export const ChristmasTree: React.FC = () => {
    return (
        <div className="container py-16">
            <div
                className="tree">
                <div className="trunk ts-3d">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
                <div className="leaves-bottom ts-3d">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
                <div className="leaves-middle ts-3d">
                    <div className="ts-3d"></div>
                    <div className="ts-3d"></div>
                    <div className="ts-3d"></div>
                    <div className="ts-3d"></div>
                </div>
                <div className="leaves-top ts-3d">
                    <div className="ts-3d"></div>
                    <div className="ts-3d"></div>
                    <div className="ts-3d"></div>
                    <div className="ts-3d"></div>
                </div>
                <div className="star star-1 ts-3d"></div>
                <div className="star star-2 ts-3d"></div>
                <div className="star star-3 ts-3d"></div>
                <div className="star star-4 ts-3d"></div>
                <div className="star star-5 ts-3d"></div>
                <div className="shine ts-3d"></div>
            </div>
            <div className="snow-container">
                <div className="snow snow-1 snow-y-1"></div>
                <div className="snow snow-2 snow-y-2"></div>
                <div className="snow snow-3 snow-y-3"></div>
                <div className="snow snow-4 snow-y-3"></div>
                <div className="snow snow-5 snow-y-2"></div>
                <div className="snow snow-6 snow-y-1"></div>
                <div className="snow snow-7 snow-y-1"></div>
                <div className="snow snow-8 snow-y-2"></div>
                <div className="snow snow-9 snow-y-3"></div>
                <div className="snow snow-10 snow-y-3"></div>
            </div>
        </div>
    );
};
