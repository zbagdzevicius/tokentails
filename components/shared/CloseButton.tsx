interface ICloseButton {
    onClick: () => void
}

export const CloseButton = ({ onClick }: ICloseButton) => {
    return (
        <img src='/icons/pixel-close.png' className="hover:brightness-150 hover:translate hover:scale-125 lg:w-9 w-7 lg:h-9 h-7 absolute top-0 right-0 lg:m-4 m-2 z-[90]" onClick={onClick} />
    )
}
