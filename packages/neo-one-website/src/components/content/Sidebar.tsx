import * as React from 'react';
import { MdClose, MdUnfoldMore } from 'react-icons/md';
import { Box, Button, Grid, Hidden, styled } from 'reakit';
import { prop } from 'styled-tools';
import { SectionData } from '../../types';
import { SidebarSpacer } from '../common';
import { SidebarList } from './SidebarList';

const Wrapper = styled(Box)``;

const DesktopSidebarList = styled(SidebarList)`
  position: fixed;
  z-index: 2;
  height: calc(100vh - 72px);
  overflow-y: auto;
  margin-right: -1000px;
  padding-right: 1000px;

  @media (min-width: ${prop('theme.breakpoints.sm')}) {
    height: calc(100vh - 80px);
  }
`;

const MobileWrapper = styled(Box)`
  @media (min-width: ${prop('theme.breakpoints.sm')}) {
    display: none;
  }
`;

const StyledHidden = styled(Hidden)`
  position: fixed;
  top: 72px;
  bottom: 0px;
  left: 0px;
  right: 0px;
  z-index: 2;
  height: calc(100vh - 72px);
  overflow-y: auto;

  @media (min-width: ${prop('theme.breakpoints.sm')}) {
    top: 80px;
    height: calc(100vh - 80px);
  }
`;

const MobileSidebarWrapper = styled(Box)`
  height: 100%;
  width: 100%;
  background-color: ${prop('theme.gray1')};
`;

const MobileButton = styled(Button)`
  position: fixed;
  bottom: 48px;
  right: 24px;
  background-color: ${prop('theme.black')};
  border: 1px solid ${prop('theme.gray4')};
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
  border-radius: 64px;
  color: ${prop('theme.primary')};
  width: 64px;
  height: 64px;
  padding: 0;
  transform: translate(0, 0) scale(1);
  transition: transform 0.15s ease-in-out;
  cursor: pointer;
  outline: none;
  z-index: 5;

  &:hover {
    transform: translate(0, -2px) scale(1);
  }

  &:active {
    transform: translate(0, -2px) scale(1);
  }

  &:focus {
    transform: translate(0, -2px) scale(1);
  }
`;

const IconWrapper = styled(Grid)`
  width: 100%;
  height: 100%;
  justify-items: center;
  align-items: center;

  & > svg {
    width: 32px;
    height: 32px;
  }
`;

interface Props {
  readonly current: string;
  readonly alwaysVisible: boolean;
  readonly sections: ReadonlyArray<SectionData>;
}

export const Sidebar = ({ current, alwaysVisible, sections, ...props }: Props) => (
  <Wrapper {...props}>
    <SidebarSpacer>
      <DesktopSidebarList current={current} alwaysVisible={alwaysVisible} sections={sections} />
    </SidebarSpacer>
    <MobileWrapper>
      <Hidden.Container>
        {({ visible, hide, toggle }) => (
          <>
            <StyledHidden visible={visible}>
              <MobileSidebarWrapper>
                <SidebarList current={current} alwaysVisible sections={sections} onClickLink={hide} />
              </MobileSidebarWrapper>
            </StyledHidden>
            <MobileButton onClick={toggle}>
              <IconWrapper>{visible ? <MdClose /> : <MdUnfoldMore />}</IconWrapper>
            </MobileButton>
          </>
        )}
      </Hidden.Container>
    </MobileWrapper>
  </Wrapper>
);