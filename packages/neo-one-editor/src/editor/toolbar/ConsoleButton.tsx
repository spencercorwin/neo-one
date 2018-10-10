import { Tooltip, TooltipArrow } from '@neo-one/react';
import * as React from 'react';
import { Button, Grid, styled } from 'reakit';
import { prop } from 'styled-tools';

const Wrapper = styled(Grid)`
  place-items: center;
`;

const IconWrapper = styled(Button)`
  color: ${prop('theme.gray0')};
  cursor: pointer;
  outline: none;
  display: grid;
  place-items: center;
  padding: 8px;
`;

interface Props {
  readonly onClick: () => void;
  readonly icon: React.ReactNode;
  readonly tooltip: React.ReactNode;
}

export const ConsoleButton = ({ onClick, icon, tooltip, ...props }: Props) => (
  <Wrapper {...props}>
    <IconWrapper data-test="console-button" onClick={onClick}>
      {icon}
    </IconWrapper>
    <Tooltip>
      <TooltipArrow />
      {tooltip}
    </Tooltip>
  </Wrapper>
);