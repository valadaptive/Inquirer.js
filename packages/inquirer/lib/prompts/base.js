/**
 * Base prompt implementation
 * Should be extended by prompt types.
 */
import pc from 'picocolors';
import runAsync from 'run-async';
import { filter, mergeMap, share, take, takeUntil } from 'rxjs';
import Choices from '../objects/choices.js';
import ScreenManager from '../utils/screen-manager.js';

export default class Prompt {
  constructor(question, rl, answers) {
    // Setup instance defaults property
    Object.assign(this, {
      answers,
      status: 'pending',
    });

    // Set defaults prompt options
    this.opt = {
      validate: () => true,
      validatingText: '',
      filter: (val) => val,
      filteringText: '',
      when: () => true,
      suffix: '',
      prefix: pc.green('?'),
      transformer: (val) => val,
      ...question,
    };

    // Make sure name is present
    if (!this.opt.name) {
      this.throwParamError('name');
    }

    // Set default message if no message defined
    this.opt.message ||= this.opt.name + ':';

    // Normalize choices
    if (Array.isArray(this.opt.choices)) {
      this.opt.choices = new Choices(this.opt.choices, answers);
    }

    this.rl = rl;
    this.screen = new ScreenManager(this.rl);
  }

  /**
   * Start the Inquiry session and manage output value filtering
   * @return {Promise}
   */

  run() {
    return new Promise((resolve, reject) => {
      this._run(
        (value) => resolve(value),
        (error) => reject(error),
      );
    });
  }

  // Default noop (this one should be overwritten in prompts)
  _run(cb) {
    cb();
  }

  /**
   * Throw an error telling a required parameter is missing
   * @param  {String} name Name of the missing param
   * @return {Throw Error}
   */

  throwParamError(name) {
    throw new Error('You must provide a `' + name + '` parameter');
  }

  /**
   * Called when the UI closes. Override to do any specific cleanup necessary
   */
  close() {
    this.screen.releaseCursor();
  }

  /**
   * Run the provided validation method each time a submit event occur.
   * @param  {Rx.Observable} submit - submit event flow
   * @return {Object}        Object containing two observables: `success` and `error`
   */
  handleSubmitEvents(submit) {
    const validate = runAsync(this.opt.validate);
    const asyncFilter = runAsync(this.opt.filter);
    const validation = submit.pipe(
      mergeMap((value) => {
        this.startSpinner(value, this.opt.filteringText);
        return asyncFilter(value, this.answers).then(
          (filteredValue) => {
            this.startSpinner(filteredValue, this.opt.validatingText);
            return validate(filteredValue, this.answers).then(
              (isValid) => ({ isValid, value: filteredValue }),
              (error_) => ({ isValid: error_, value: filteredValue }),
            );
          },
          (error_) => ({ isValid: error_ }),
        );
      }),
      share(),
    );

    const success = validation.pipe(
      filter((state) => state.isValid === true),
      take(1),
    );
    const error = validation.pipe(
      filter((state) => state.isValid !== true),
      takeUntil(success),
    );

    return {
      success,
      error,
    };
  }

  startSpinner(value, bottomContent) {
    value = this.getSpinningValue(value);
    // If the question will spin, cut off the prefix (for layout purposes)
    const content = bottomContent
      ? this.getQuestion() + value
      : this.getQuestion().slice(this.opt.prefix.length + 1) + value;

    this.screen.renderWithSpinner(content, bottomContent);
  }

  /**
   * Allow override, e.g. for password prompts
   * See: https://github.com/SBoudrias/Inquirer.js/issues/1022
   *
   * @return {String} value to display while spinning
   */
  getSpinningValue(value) {
    return value;
  }

  /**
   * Generate the prompt question string
   * @return {String} prompt question string
   */
  getQuestion() {
    let message =
      (this.opt.prefix ? this.opt.prefix + ' ' : '') +
      pc.bold(this.opt.message) +
      this.opt.suffix +
      pc.reset(' ');

    // Append the default if available, and if question isn't touched/answered
    if (
      this.opt.default != null &&
      this.status !== 'touched' &&
      this.status !== 'answered'
    ) {
      // If default password is supplied, hide it
      message +=
        this.opt.type === 'password'
          ? pc.italic(pc.dim('[hidden] '))
          : pc.dim('(' + this.opt.default + ') ');
    }

    return message;
  }
}
