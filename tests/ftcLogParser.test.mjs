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

import { parseFTCDeviceInfoLog, parseFTCLog } from '../src/utils/ftcLogParser.ts';

test('reads motor names and ports from actual FTC SDK Device Information table', () => {
  const log = [
    '11-03 12:15:56.914  1488  1583 I RobotCore: ========= Device Information ===================================================',
    '11-03 12:15:56.914  1488  1583 I RobotCore: Type                                               Name                           Connection',
    '11-03 12:15:56.916  1488  1583 I RobotCore: Motor                                              intake                         USB (embedded); module 173; port 2',
    '11-03 12:15:56.916  1488  1583 I RobotCore: Motor                                              left                           USB (embedded); module 173; port 1',
    '11-03 12:15:56.917  1488  1583 I RobotCore: REV internal IMU (BHI260AP)                        imu                            BHI260 IMU on USB (embedded); module 173; bus 0; addr7=0x28',
    '11-03 12:15:56.918  1488  1583 I RobotCore: Motor                                              right                          USB (embedded); module 173; port 0',
    '11-03 12:15:56.919  1488  1583 I RobotCore: Expansion Hub Servo Controller                     Control Hub                    USB (embedded); module 173',
    '11-03 12:15:56.930  1488  1595 V RobotCore: nack rec\'d mod=173',
    '11-03 12:16:11.139  1645  1645 V NetDiscover_prefremrc: name=\'pref_hardware_config_filename\' value={"isDirty":false,"location":"LOCAL_STORAGE","name":"Test","resourceId":0}',
  ].join('\n');
  const configuration = parseFTCLog(log);
  assert.equal(configuration.source, 'log-device-info');
  assert.equal(configuration.name, 'Test');
  assert.deepEqual(configuration.hubs.map(h => ({
    name: h.name, module: h.moduleAddress,
    components: h.components.map(c => [c.name, c.type, c.port]),
  })), [{
    name: 'Control Hub', module: 173,
    components: [['intake', 'motor', 2], ['left', 'motor', 1], ['right', 'motor', 0]],
  }]);
});

test('avoids duplicated devices across repeated FTC log snapshots', () => {
  const block = [
    '11-03 12:15:56.914  1488  1583 I RobotCore: ========= Device Information ===================================================',
    '11-03 12:15:56.914  1488  1583 I RobotCore: Type                                               Name                           Connection',
    '11-03 12:15:56.916  1488  1583 I RobotCore: Motor                                              right                          USB (embedded); module 173; port 0',
    '11-03 12:15:56.919  1488  1583 I RobotCore: Expansion Hub Servo Controller                     Control Hub                    USB (embedded); module 173',
  ].join('\n');
  const config = parseFTCDeviceInfoLog(block + '\n' + block);
  assert.equal(config?.hubs[0].components.length, 1);
});

test('ignores ordinary logs that do not have a valid Device Information table', () => {
  assert.equal(parseFTCDeviceInfoLog('11-03 V RobotCore: DcMotorImpl(type=Motor)\nLynxModule mod#=173'), null);
});
