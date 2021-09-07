'use strict';

const { execFile } = require('child_process');
const chalk = require('chalk');
const PluginError = require('plugin-error');
const through = require('through2');
const vnuJar = require('vnu-jar');
const winston = require('winston');

const defaultOptions = {
  'errors-only': false,
  'format': 'gnu',
  'html': false,
  'no-stream': false,
  'verbose': false
};
const defaultFormats = new Set(['gnu', 'xml', 'json', 'text']);

const vnuErrorLevels = {
  'success': 0,
  'error': 1,
  'info': 2,
  'non-document-error': 3
};

const logger = winston.createLogger({
  levels: vnuErrorLevels,
  transports: [
    new (winston.transports.Console)({
      formatter(options) {
        let levelType = '';

        // Return string will be passed to logger.
        switch (options.level) {
          case 'error': {
            levelType = chalk.red('error: ');
            break;
          }

          case 'info': {
            levelType = chalk.yellow('warning: ');
            break;
          }

          case 'success': {
            return `${chalk.green(options.message) + chalk.underline.bold(options.meta.path)}\n`;
          }

          default: {
            return chalk.bold('non-document-error: ') + options.message;
          }
        }

        return levelType + chalk.underline.bold(options.meta.url) + '\n' +
          chalk.bold(options.meta.lastLine + ':' + options.meta.firstColumn) + '\t' + options.message + '\n' +
          'source: ' + options.meta.extract + '\n';
      }
    })
  ]
});

const handleJsonError = (error, messages, path) => {
  const parsedMessages = JSON.parse(messages).messages;

  if (error === null && parsedMessages.length === 0) {
    return logger.log('success', 'Document is valid: ', { path });
  }

  return parsedMessages.map(message => logger.log(message.type, message.message, message));
};

module.exports = options => {
  const vnuArgs = ['-Xss1024k', '-jar', `"${vnuJar}"`];
  const mergedOptions = { ...defaultOptions, ...options };

  // Set options
  for (const key of Object.keys(mergedOptions)) {
    const value = mergedOptions[key];
    if (key === 'format' && defaultFormats.has(value)) {
      vnuArgs.push('--format', value);
    }

    if (value === true) {
      vnuArgs.push(`--${key}`);
    }
  }

  return through.obj((file, enc, cb) => {
    if (file.isNull()) {
      return cb(null, file);
    }

    if (file.isStream()) {
      return cb(new PluginError('gulp-html', 'Streaming not supported'));
    }

    vnuArgs.push(file.history.map(f => `"${f}"`));

    execFile('java', vnuArgs, { shell: true }, (error, stdout, stderr) => {
      if (mergedOptions.format === 'json') {
        return cb(handleJsonError(error, stderr, file.history[0]));
      }

      return error === null ?
        cb(null, file) :
        cb(new PluginError('gulp-html', stderr));
    });
  });
};
