"use strict";
///
/// Copyright © 2023 ThingsBoard, Inc.
///
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = execute;
exports.createServer = createServer;
const architect_1 = require("@angular-devkit/architect");
const express_1 = require("express");
const http = require("http");
const path_1 = require("path");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const ng_packagr_1 = require("ng-packagr");
const fs_1 = require("fs");
const chokidar_1 = require("chokidar");
const child_process_1 = require("child_process");
let server = null;
function initialize(options, root) {
    return __awaiter(this, void 0, void 0, function* () {
        const packager = (0, ng_packagr_1.ngPackagr)();
        packager.forProject((0, path_1.resolve)(root, options.project));
        if (options.tsConfig) {
            packager.withTsConfig((0, path_1.resolve)(root, options.tsConfig));
        }
        return packager;
    });
}
function watchStyles(options, context) {
    const styleScss = (0, path_1.resolve)(context.workspaceRoot, 'src', 'app', 'scss', 'style.scss');
    if ((0, fs_1.existsSync)(styleScss)) {
        const styleCompScss = (0, path_1.resolve)(context.workspaceRoot, 'src', 'app', 'scss', 'style.comp.scss');
        context.logger.info(`==> Watching library styles: ${styleScss}`);
        const postcss = (0, path_1.resolve)(context.workspaceRoot, 'node_modules', '.bin', 'postcss');
        (0, chokidar_1.watch)(styleScss).on('change', () => {
            const compileStyleScssCommand = `${postcss} ${styleScss} -o ${styleCompScss}`;
            executeCliCommand(context, compileStyleScssCommand, 'Compile style.scss');
        });
    }
}
function executeCliCommand(context, cliCommand, description) {
    try {
        (0, child_process_1.execSync)(cliCommand, {
            stdio: 'inherit'
        });
    }
    catch (err) {
        context.logger.error(`==> ${description} failed`, err);
        process.exit(1);
    }
}
function execute(options, context) {
    watchStyles(options, context);
    return (0, rxjs_1.from)(initialize(options, context.workspaceRoot)).pipe((0, operators_1.switchMap)(packager => {
        return packager.watch().pipe((0, operators_1.tap)(() => {
            createServer(options, context);
        }));
    }), (0, operators_1.mapTo)({ success: true }));
}
function createServer(options, context) {
    if (server) {
        server.close();
        server = null;
    }
    const app = (0, express_1.default)();
    const staticServeConfig = require((0, path_1.resolve)(context.workspaceRoot, options.staticServeConfig));
    for (const path of Object.keys(staticServeConfig)) {
        const route = staticServeConfig[path];
        app.get(path, (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', 'origin, content-type, accept');
            if (path.endsWith('*')) {
                const target = req.params[0];
                res.sendFile((0, path_1.resolve)(context.workspaceRoot, route.target + target));
            }
            else {
                res.sendFile((0, path_1.resolve)(context.workspaceRoot, route.target));
            }
        });
    }
    /* app.get(options.path, (req, res) => {
      res.sendFile(resolve(context.workspaceRoot, options.source));
    });*/
    /*  app.get('/static/rulenode/rulenode-core-config.umd.js.map', (req, res) => {
        res.sendFile(resolve(context.workspaceRoot, 'dist/rulenode-core-config/bundles/rulenode-core-config.umd.js.map'));
      }); */
    server = http.createServer(app);
    const host = 'localhost';
    server.on('error', (error) => {
        context.logger.error(error.message);
    });
    server.listen(options.port, host, 511, () => {
        context.logger.info(`==> 🌎  Listening on port ${options.port}. Open up http://localhost:${options.port}/ in your browser.`);
    });
}
exports.default = (0, architect_1.createBuilder)(execute, context);
