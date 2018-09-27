// tslint:disable no-null-keyword
import * as React from 'react';
import { MdClose, MdDeleteSweep } from 'react-icons/md';
import { connect } from 'react-redux';
import { css, Grid, styled } from 'reakit';
import { clearConsole, EditorState, selectConsoleProblems, selectConsoleType, setConsoleType } from '../redux';
import { ConsoleType, FileDiagnostic } from '../types';
import { ConsoleButton } from './ConsoleButton';
import { ConsoleTab } from './ConsoleTab';
import { ProblemCount } from './ProblemCount';

const Wrapper = styled(Grid)`
  justify-content: space-between;
  gap: 8px;
  grid:
    'tabs buttons' auto
    / auto auto;
`;

const TabsWrapper = styled(Grid)`
  padding-left: 8px;
  gap: 0;
  grid-auto-flow: column;
  align-items: center;
`;

const ButtonsWrapper = styled(Grid)`
  gap: 0;
  grid-auto-flow: column;
  align-items: center;
`;

const iconCSS = css`
  height: 16px;
  width: 16px;
`;

const Delete = styled(MdDeleteSweep)`
  ${iconCSS};
`;

const Close = styled(MdClose)`
  ${iconCSS};
`;

interface Props {
  readonly consoleType: ConsoleType;
  readonly consoleProblems: ReadonlyArray<FileDiagnostic>;
  readonly onClearConsole: () => void;
  readonly onClickProblems: () => void;
  readonly onClickOutput: () => void;
  readonly onCloseConsole: () => void;
}

const getErrorOrWarnCount = (consoleProblems: ReadonlyArray<FileDiagnostic>) =>
  consoleProblems.filter((problem) => problem.severity === 'error').length +
  consoleProblems.filter((problem) => problem.severity === 'warning').length;

const ConsoleHeaderBase = ({
  consoleType,
  consoleProblems,
  onClickOutput,
  onClickProblems,
  onClearConsole,
  onCloseConsole,
  ...props
}: Props) => {
  const problemCount = getErrorOrWarnCount(consoleProblems);

  return (
    <Wrapper {...props}>
      <TabsWrapper>
        <ConsoleTab selected={consoleType === 'problems'} onClick={onClickProblems} text="PROBLEMS">
          {problemCount === 0 ? null : <ProblemCount>{problemCount}</ProblemCount>}
        </ConsoleTab>
        <ConsoleTab selected={consoleType === 'output'} onClick={onClickOutput} text="OUTPUT" />
      </TabsWrapper>
      <ButtonsWrapper>
        {consoleType === 'output' ? (
          <ConsoleButton icon={<Delete />} onClick={onClearConsole} tooltip="Clear Output" />
        ) : null}
        <ConsoleButton icon={<Close />} onClick={onCloseConsole} tooltip="Close Panel" />
      </ButtonsWrapper>
    </Wrapper>
  );
};

export const ConsoleHeader = connect(
  (state: EditorState) => ({
    ...selectConsoleType(state),
    ...selectConsoleProblems(state),
  }),
  (dispatch) => ({
    onClickProblems: () => dispatch(setConsoleType('problems')),
    onClickOutput: () => dispatch(setConsoleType('output')),
    onClearConsole: () => dispatch(clearConsole()),
  }),
)(ConsoleHeaderBase);
