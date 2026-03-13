import React from 'react';
import type { IconProps } from '../types';

export const OHIFLogo = ({ className, ...props }: IconProps) => (
  <img
    src="/ohif-logo-light.svg"
    alt="OHIF logo"
    width={138}
    height={28}
    className={className}
    {...props}
  />
);

export default OHIFLogo;
