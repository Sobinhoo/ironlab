import test from 'node:test';
import assert from 'node:assert/strict';
import { findLatestRobotXml } from '../src/utils/ftcLogParser.ts';

test('reads latest FTC configuration from prefixed Robot Controller logs', () => {
  const log = [
    '10-07 12:07:35.892 V FtcConfigTag: <Robot>',
    '10-07 12:07:35.892 V FtcConfigTag:   <LynxUsbDevice>',
    '10-07 12:07:35.892 V FtcConfigTag:     <LynxModule name="Control Hub" port="173">',
    '10-07 12:07:35.892 V FtcConfigTag:       <RevRoboticsCoreHexMotor name="Old" port="0" />',
    '10-07 12:07:35.892 V FtcConfigTag:     </LynxModule>',
    '10-07 12:07:35.892 V FtcConfigTag:   </LynxUsbDevice>',
    '10-07 12:07:35.892 V FtcConfigTag: </Robot>',
    '10-07 12:07:44.478 V Robocol: CMD_SAVE_CONFIGURATION {"name":"Test"}',
    '10-07 12:07:44.478 V Robocol: <Robot type="FirstInspires-FTC">',
    '10-07 12:07:44.478 V Robocol:   <LynxUsbDevice name="Portal">',
    '10-07 12:07:44.478 V Robocol:     <LynxModule name="Control Hub" port="173">',
    '10-07 12:07:44.478 V Robocol:       <RevRobotics40HDHexMotor name="Drive" port="2" />',
    '10-07 12:07:44.478 V Robocol:     </LynxModule>',
    '10-07 12:07:44.478 V Robocol:   </LynxUsbDevice>',
    '10-07 12:07:44.478 V Robocol: </Robot>',
  ].join('\n');
  const xml = findLatestRobotXml(log);
  assert.match(xml, /name="Drive"/);
  assert.doesNotMatch(xml, /name="Old"/);
  assert.match(xml, /<LynxModule/);
});

test('accepts direct FTC Robot XML', () => {
  assert.equal(findLatestRobotXml('<?xml version="1.0"?>\n<Robot>\n<LynxModule port="173" />\n</Robot>'),
    '<Robot>\n<LynxModule port="173" />\n</Robot>');
});

test('does not interpret unrelated log lines as a robot configuration', () => {
  assert.equal(findLatestRobotXml('LynxModule: mod#=173\nCMD_ACTIVATE_CONFIGURATION'), '');
  assert.equal(findLatestRobotXml('<Robot>\n<LynxModule port="173"/>'), '');
});
