interface ICloseButton {
    onClick: () => void
}

export const CloseButton = ({ onClick }: ICloseButton) => {
    return (
        <img src='icons/close.svg' className="lg:w-10 w-8 lg:h-10 h-8 absolute top-0 right-0 m-2 z-[99]" onClick={onClick} />
    )
}
