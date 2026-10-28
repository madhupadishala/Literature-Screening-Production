import {forwardRef,type InputHTMLAttributes} from "react";import s from "./primitives.module.css";
type Props=InputHTMLAttributes<HTMLInputElement> & {finalized?:boolean};
export const Input=forwardRef<HTMLInputElement,Props>(function Input({finalized,readOnly,className,...props},ref){return <input {...props} ref={ref} readOnly={readOnly||finalized} aria-readonly={readOnly||finalized||undefined} className={[s.control,className].filter(Boolean).join(" ")}/>;});
export default Input;