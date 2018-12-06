// Copyright 2016 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

(function() {
    'use strict';
    document.getElementById('canonical_link').href = SPOTCONTROL.domain;
    var app = {
        isLoading: true,
        visibleCards: {},
        spinner: document.querySelector('.loader'),
        cardTemplate: document.querySelector('.card-template'),
        container: document.querySelector('.list-results'),
        containerJQuery: $('.list-results'),
        addDialog: document.querySelector('.dialog-container'),
    };
    var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    var dataBase = null;

    /**
     * Creación del almacén de objetos (DB)
     *
     * @return void
     */
    app.startDB = function() {
        dataBase = indexedDB.open("spotcontrol", 1);
        dataBase.onupgradeneeded = function(e) {

            //Tabla Personas
            var object = dataBase.result.createObjectStore("persons", {
                keyPath: 'id',
                autoIncrement: true
            });
            object.createIndex('by_dni', 'dni', {
                unique: false
            });
            //Tabla Vehículos
            object = dataBase.result.createObjectStore("vehicles", {
                keyPath: 'id',
                autoIncrement: true
            });
            object.createIndex('by_plate_number', 'plate_number', {
                unique: false
            });
            //Tabla Marcado
            object = dataBase.result.createObjectStore("spotcontrol_details", {
                keyPath: 'id',
                autoIncrement: true
            });
            object.createIndex('by_plate_number', 'plate_number', {
                unique: false
            });
            object.createIndex('by_dni', 'dni', {
                unique: false
            });
            //Tabla Vencimiento
            object = dataBase.result.createObjectStore("expiration", {
                keyPath: 'id',
                autoIncrement: true
            });
            //Tabla usuario logueado
            object = dataBase.result.createObjectStore("users", {
                keyPath: 'id',
                autoIncrement: false
            });
            object.createIndex('by_username', 'username', {
                unique: true
            });
            /*object.createIndex('by_token', 'token', {
                unique: true
            });*/
            object.createIndex('by_logged', 'logged', {
                unique: true
            });
        };
        dataBase.onsuccess = function(e) {
            console.log('[spotcontrol] Base de Datos Creada');
            isOnline(
                function() {
                    var url = SPOTCONTROL.domain + 'mark.html';
                    if (window.location == url) {
                        app.checkExpiration(false);
                    }else {
                        $('.card-searcher').removeClass('hidden');
                        $('.login-form').removeClass('hidden');
                        $('.input-group').removeClass('hidden');
                        $('.loader').addClass('hidden');
                    }
                },
                function() {
                    $('.card-searcher').removeClass('hidden');
                    $('.login-form').removeClass('hidden');
                    $('.input-group').removeClass('hidden');
                    $('.loader').addClass('hidden');
                });
            getPosition(false);
            app.checkUser();
            checkConnectionStatus();

        };
        dataBase.onerror = function(e) {
            console.log('[Error] Creación de la DB');
            hideLoader('Ha ocurrido un error en la creación de la DB', 'alert-danger');
        };
    };

    /**
     * Ejecución del login a la aplicación, ejecuta el primer inicio de sesión al WS de ser éxitoso almacena internamente las credenciales
     * para poder realizar posteriores inicios de esión en modo offline
     *
     * @return void
     */
    app.login = function() {
        var username = $('#username').val();
        var password = $('#password').val();
        isOnline(
            //Logueo Online
            function() {
                $.ajax({
                    url: SPOTCONTROL.API + "login",
                    type: "GET",
                    dataType: 'json',
                    data: {
                        'username': username,
                        'password': password,
                    },
                    beforeSend: function() {
                        checkConnectionStatus();
                    }
                }).done(function(response) {
                    if (response) {
                        app.userLogin(response);
                    } else {
                        $('#result').html("<div class='alert alert-danger'>Correo electrónico y/o contraseña incorrectos</div>");
                    }
                }).fail(function(jqXHR, textStatus, errorThrown) {
                    console.log("[Error] login online: " + textStatus);
                }).always(function(jqXHR, textStatus, errorThrown) {
                });
        }, function() {
            //Logueo Offline
            var token = CryptoJS.HmacSHA256(username + password, SPOTCONTROL.keyPhrase).toString();
            var data = dataBase.result.transaction(["users"], "readonly");
            var object = data.objectStore("users");
            var index = object.index("by_");
            var request = index.get(token);

            request.onsuccess = function(e) {
                var result = request.result;
                if (typeof result !== "undefined") {
                    app.userLogin(result);
                } else {
                    $('#result').html("<div class='alert alert-danger'>Correo electrónico y/o contraseña incorrectos</div>");
                }
            };

            request.onerror = function(e) {
                console.log('[Error] login offline: ' + request.error.name + '\n\n' + request.error.message);
                hideLoader('Ha ocurrido un error en el intento de login', 'alert-danger');
            };
        });
    };

    /**
     * Buscar usuario logueado, cambiar su estado (logged=false) y redireccionar
     *
     * @return void
     */
    app.logout = function() {
        var data = dataBase.result.transaction(["users"], "readwrite");
        var object = data.objectStore("users");
        var index = object.index("by_logged");
        var request = index.get("1");

        request.onsuccess = function(e) {
            var result = e.target.result;
            if (result.logged === '1') {
                var request = object.put({
                    id: result.id,
                    username: result.username,
                    token: result.token,
                    logged: '0',
                    loginTime: result.loginTime,
                });
                request.onerror = function(e) {
                    console.log(request.error.name + ': ' + request.error.message + ', ' + e);
                };
                return;
            }
        };

        data.oncomplete = function(e) {
            redirect(SPOTCONTROL.domain + 'index.html', 'Su sesión se ha cerrado, redireccionando');
        };
    };

    /**
     * Ejecución del marcado como controlado, en modo online realiza ejecuta enviando la petición al WS
     * en modo offline, realiza el marcado dentro del almacenamiento interno
     *
     * @return void
     */
    app.mark = function() {
        var elements = [{
            'lng':          $('#hidden_lng').val(),
            'lat':          $('#hidden_lat').val(),
            'position':     $('#hidden_position').val(),
            'observations': $('#text_observations').val(),
            'date':         $('#hidden_date_mark').val(),
            'plate_number': $('#hidden_plate_number').val(),
            'dni':          $('#hidden_dni').val(),
            'user_id':      $('#hidden_user_id').val(),
            'type':         $('#hidden_type').val()
        }];

        isOnline(
            function() {
                var msg = '';
                var msgType = '';

                var data = dataBase.result.transaction(["users"], "readonly");
                var object = data.objectStore("users");
                var index = object.index("by_logged");
                var request = index.get("1");

                request.onsuccess = function(e) {
                    var result = e.target.result;

                    if (typeof result !== "undefined") {

                        $.ajax({
                            url: SPOTCONTROL.API + "upload" + '?jwt=' + result.jwt,
                            //url: SPOTCONTROL.API + "upload",
                            type: "POST",
                            dataType: 'json',
                            data: {
                                'elements': elements
                            },
                            beforeSend: function(xhr) {
                                //xhr.setRequestHeader('Authorization', 'Bearer ' + result.jwt);
                                //xhr.setRequestHeader('jwt', result.jwt);
                                checkConnectionStatus();
                                showLoader('Guardando los datos, por favor aguarde unos instantes')
                            }
                        }).done(function(response) {
                            if (response) {
                                console.log('[spotcontrol_details] AJAX marcar vehículo o persona: ' + response);
                                msg = 'Los datos han sido guardados exitosamente';
                                msgType = 'alert-success';
                            } else {
                                console.log('[spotcontrol_details] AJAX error en procesamiento: ' + response);
                                msg = 'Hubo un error al guardar los datos';
                                msgType = 'alert-danger';
                            }
                        }).fail(function(jqXHR, textStatus, errorThrown) {
                            console.log('[Error] AJAX marcar vehículo o persona: ' + textStatus);
                            msg = 'Hubo un error al guardar los datos';
                            msgType = 'alert-danger';
                        }).always(function(jqXHR, textStatus, errorThrown) {
                            hideLoader(msg, msgType);
                        });

                    } else {
                        msg = 'Hubo un error al guardar los datos';
                        msgType = 'alert-danger';

                        console.log("[uploadData] Error al realizar upload");
                        noResult(msg, msgType, false, '');
                    }
                };

                request.onerror = function() {
                    msg = 'Hubo un error al guardar los datos';
                    msgType = 'alert-danger';

                    console.log("[uploadData] Error al realizar upload");
                    noResult(msg, msgType, false, '');
                };
        }, function() {
            var data = dataBase.result.transaction(["spotcontrol_details"], "readwrite");
            var object = data.objectStore("spotcontrol_details");
            var request = object.put(elements[0]);

            data.oncomplete = function(e) {
                var msg = 'Los datos han sido guardados exitosamente';
                var msgType = 'alert-success';

                console.log('[spotcontrol_details] Los datos han sido guardados exitosamente (data.oncomplete)');
                noResult(msg, msgType, false, '');
            };

            data.onerror = function(e) {
                var msg = 'Hubo un error al guardar los datos';
                var msgType = 'alert-danger';

                console.log('[Error] spotcontrol_details: ' + data.error.name + ', ' + data.error.message);
                noResult(msg, msgType, false, '');
            };
        });
    };


    /**
     * Búsqueda individual de los vehículos, primero busca en cache, si existe lo muestra, sino verifica que haya conexión y consulta a la API
     * @param  {string} plate_number Número de patente del vehículo
     * @return {json}   datos del vehículo
     */
    app.findVehicle = function(plate_number) {
        var elements = [];
        var data = dataBase.result.transaction(["vehicles"], "readonly");
        var object = data.objectStore("vehicles");
        var index = object.index("by_plate_number");
        var request = index.get(String(plate_number));

        request.onsuccess = function(e) {
            var result = e.target.result;
            elements.push(result);
            if (typeof result !== "undefined") {
                showVehicleList(elements);
            } else {
                isOnline(
                    function() {
                        var data = dataBase.result.transaction(["users"], "readonly");
                        var object = data.objectStore("users");
                        var index = object.index("by_logged");
                        var request = index.get("1");

                        request.onsuccess = function(e) {
                            var result = e.target.result;

                            if (typeof result !== "undefined") {

                                $.ajax({
                                    url: SPOTCONTROL.API + "vehicleByPlateNumber" + '?jwt=' + result.jwt,
                                    //url: SPOTCONTROL.API + "vehicleByPlateNumber",
                                    type: "GET",
                                    dataType: 'json',
                                    data: {
                                        'plate_number': plate_number
                                    },
                                    beforeSend: function(xhr) {
                                        //xhr.setRequestHeader('Authorization', 'Bearer ' + result.jwt);
                                        //xhr.setRequestHeader('jwt', result.jwt);
                                        checkConnectionStatus();
                                        showLoader('Buscando el vehiculo ingresado, por favor aguarde unos instantes')
                                    }
                                }).done(function(response) {
                                    hideLoader('', 'hidden', false);

                                    if (response) {
                                        showVehicleList(response);
                                        console.log('[findVehicle] AJAX vehículo encontrado');
                                    } else {
                                        console.log('[findVehicle] AJAX vehículo NO encontrado');
                                        noResult('No encontramos el vehículo que busca', 'alert-warning', true, 'vehicle');
                                    }
                                }).fail(function(jqXHR, textStatus, errorThrown) {
                                    hideLoader('', 'hidden', false);
                                    console.log('[Error] AJAX findVehicle: ' + textStatus);
                                    noResult('No encontramos el vehículo que busca', 'alert-warning', true, 'vehicle');
                                }).always(function(jqXHR, textStatus, errorThrown) {
                                    $('.card-marker').removeClass('hidden');
                                });
                            } else {
                                var msg = 'Hubo un error al buscar los datos solicitados';
                                var msgType = 'alert-danger';

                                console.log('[Error] spotcontrol_details: ' + data.error.name + ', ' + data.error.message);
                                noResult(msg, msgType, true, 'vehicle');
                            }
                        };

                        request.onerror = function() {
                            var msg = 'Hubo un error al buscar los datos solicitados';
                            var msgType = 'alert-danger';

                            console.log('[Error] spotcontrol_details: ' + data.error.name + ', ' + data.error.message);
                            noResult(msg, msgType, true, 'vehicle');
                        };
                }, function() {
                    console.log('[findVehicle] offline');
                    noResult('No encontramos el vehículo que busca', 'alert-warning', true, 'vehicle');
                });
            }
        };
    };

    /**
     * Búsqueda individual de las personas, en estado online consulta al WS, en estado offline consulta el almacenamiento interno
     * @param  {string} dni Número de DNI de la persona
     * @return {json}   datos del vehículo
     */
    app.findPerson = function(dni) {
        var elements = [];
        var data = dataBase.result.transaction(["persons"], "readonly");
        var object = data.objectStore("persons");
        var index = object.index("by_dni");
        var request = index.get(String(dni));

        request.onsuccess = function(e) {
            var result = e.target.result;
            elements.push(result);
            if (typeof result !== "undefined") {
                showPersonList(elements);
            } else {
                isOnline(
                    function() {
                        var data = dataBase.result.transaction(["users"], "readonly");
                        var object = data.objectStore("users");
                        var index = object.index("by_logged");
                        var request = index.get("1");

                        request.onsuccess = function(e) {
                            var result = e.target.result;

                            if (typeof result !== "undefined") {

                                $.ajax({
                                    url: SPOTCONTROL.API + "personByDni" + '?jwt=' + result.jwt,
                                    //url: SPOTCONTROL.API + "personByDni",
                                    type: "GET",
                                    dataType: 'json',
                                    data: {
                                        'dni': dni
                                    },
                                    beforeSend: function(xhr) {
                                        //xhr.setRequestHeader('Authorization', 'Bearer ' + result.jwt);
                                        //xhr.setRequestHeader('jwt', result.jwt);
                                        checkConnectionStatus();
                                        showLoader('Buscando la persona ingresada, por favor aguarde unos instantes')
                                    }
                                }).done(function(response) {
                                    var person = JSON.parse(JSON.stringify(response));

                                    hideLoader('', 'hidden', false);

                                    if (person !== false) {
                                        showPersonList(person);
                                        console.log('[findPerson] AJAX persona encontrada');
                                    } else {
                                        console.log('[findPerson] AJAX persona NO encontrada');
                                        noResult('No encontramos la persona que busca', 'alert-warning', true, 'person');
                                    }
                                }).fail(function(jqXHR, textStatus, errorThrown) {
                                    hideLoader('', 'hidden', false);
                                    console.log('[Error] AJAX findPerson: ' + textStatus);
                                    noResult('No encontramos la persona que busca', 'alert-warning', true, 'person');
                                }).always(function(jqXHR, textStatus, errorThrown) {
                                    $('.card-marker').removeClass('hidden');
                                });
                            } else {
                                var msg = 'Hubo un error al buscar los datos solicitados';
                                var msgType = 'alert-danger';

                                console.log('[Error] spotcontrol_details: ' + data.error.name + ', ' + data.error.message);
                                noResult(msg, msgType, true, 'person');
                            }
                        };

                        request.onerror = function() {
                            var msg = 'Hubo un error al buscar los datos solicitados';
                            var msgType = 'alert-danger';

                            console.log('[Error] spotcontrol_details: ' + data.error.name + ', ' + data.error.message);
                            noResult(msg, msgType, true, 'person');
                        };
                }, function() {
                    console.log("[findPerson] offline");
                    noResult('No encontramos la persona que busca', 'alert-warning', true, 'person');
                });
            }
        };
    };

    /**
     * Registra la sesión del usuario
     *
     * @param  {json} result datos del usuario a registrar de ser vacio redirije a la página de inicio de sesión
     * @return void
     */
    app.userLogin = function(result) {
        if (result) {
            var data = dataBase.result.transaction(["users"], "readwrite");
            var object = data.objectStore("users");
            var request = object.put({
                id: result.id,
                username: result.username,
                token: result.token,
                jwt: result.jwt,
                logged: '1',
                loginTime: Date.now(),
            });
            request.onerror = function(e) {
                console.log(request.error.name + '\n\n' + request.error.message);
                window.location.replace(SPOTCONTROL.domain + "index.html");
            };
            data.oncomplete = function(e) {
                //SPOTCONTROL.username = result.username;
                window.location.replace(SPOTCONTROL.domain + "mark.html");
            };
        } else {
            $('#result').html("<div class='alert alert-danger'>Correo electrónico y/o contraseña incorrectos</div>");
        }
    };

    /**
     * Verifica si la sesión de usuario existe o está vencida
     *
     * @return void
     */
    app.checkUser = function() {
        var data = dataBase.result.transaction(['users'], 'readwrite');
        var object = data.objectStore('users');
        var cursor = object.openCursor();

        cursor.onsuccess = function(e) {
            var result = e.target.result;
            var url;
            if (result === null || result.value.logged === '0') {
                console.log('Usuario No Logueado');
                url = SPOTCONTROL.domain + 'index.html';
                if (window.location != url) {
                    redirect(url, 'No ha iniciado sesión, redireccionando');
                }
            } else {
                var date1 = moment(result.value.loginTime);
                var date2 = moment(Date.now());
                console.log('Usuario Logueado');
                $('#hidden_user_id').val(result.value.id);
                if (date2.diff(date1, 'minutes') > SPOTCONTROL.sessionTime) {
                    console.log('Sesión Vencida');
                    object.clear();
                    url = SPOTCONTROL.domain + 'index.html';
                    if (window.location != url) {
                        redirect(url, "Su sesión ha vencido, redireccionando");
                    }
                } else if(result.value.logged === '1') {
                    url = SPOTCONTROL.domain + 'mark.html';
                    if (window.location != url) {
                        $('.login-form').html("Usted ya ha iniciado sesión, redireccionando");
                        redirect(url);
                    }
                }
            }
        }
    };

    /**
     * Verifica si la fecha de vencimiento de los datos de los objetos vehicles, persons fue superada,
     * de ser así limpia las tablas y estipula como nueva fecha de vencimiento la actual
     *
     * @param boolean forceUpdate
     * @return void
     */
    app.checkExpiration = function(forceUpdate = false) {
        var data = dataBase.result.transaction(['expiration'], 'readonly');
        var object = data.objectStore('expiration');
        var cursor = object.openCursor();

        cursor.onsuccess = function(e) {
            var result = e.target.result;

            // si la base local está vacía, invoco a la API
            if (result === null) {
                console.log('[Expiration] Sin datos');

                app.syncAllData();

            } else {

                //si el usuario fuerza la actualización de datos, invoco a la API
                if (forceUpdate) {
                    app.clear('persons');
                    app.clear('vehicles');
                    app.syncAllData();

                } else {
                    var date1 = moment(result.value.date);
                    var date2 = moment(Date.now());

                    // si los datos expiraron, invoco a la API
                    if (date2.diff(date1, 'minutes') > SPOTCONTROL.expiredTime) {
                        console.log('[Expiration] Sincronización data vencida');

                        app.clear('persons');
                        app.clear('vehicles');
                        app.syncAllData();

                    } else {
                        disabledButtons(false);
                        $('.input-group').removeClass('hidden');
                        $('.login-form').removeClass('hidden');
                        $('.card-searcher').removeClass('hidden');
                        $('.loader').addClass('hidden');
                    }
                }
            }
        };
    };

    /**
     * Obtiene datos de la API
     *
     * @param string type
     * @return Promise
     */
    app.loadDataFromAPI = function(type, cb) {
        var _callback = cb;
        var object = dataBase.result.transaction(["users"], "readonly").objectStore("users");
        var index = object.index("by_logged");
        var request = index.get("1");

        request.onsuccess = function(e) {
            var result = e.target.result;

            if (typeof result !== "undefined") {

                $.ajax({
                    url: `${SPOTCONTROL.API}${type}?jwt=${result.jwt}`,
                    type: "GET",
                    dataType: 'json',
                    timeout: 30 * 60 * 1000,
                    beforeSend: function(xhr) {
                      checkConnectionStatus();
                      showLoader('Actualizando los datos, por favor aguarde unos instantes')
                    }
                }).then(
                    app.successCallback.bind(null, {type: type, cb: _callback}),
                    app.errorCallback.bind(null, {cb: _callback})
                );
            } else {
                console.log("[loadDataFromAPI] Error al obtener datos del usuario");
                return _callback(new Error("[loadDataFromAPI] Error al obtener datos del usuario"));
            }
            return null;
        };

        request.onerror = function(err) {
            console.log("[loadDataFromAPI] Error al obtener datos del usuario");
            return _callback(new Error("[loadDataFromAPI] Error al obtener datos del usuario"));
        };

    };

    /** Atiende la recuperación exitosa de datos
     *
     * @param object payload
     * @param object result
     * @return Callback
     */
     app.successCallback = function (payload, result) {
        app.saveEntities(payload.type, result);
        console.log('[firstSyncDownload] (' + payload.type + '): Getting data from WS');
        return payload.cb(null,null);
    }

    /**
     * Atiende los errores de recuperación de datos
     *
     * @param object payload
     * @param object result
     * @return Callback
     */
    app.errorCallback = function (payload, result) {
        console.log('[Error] AJAX firstSyncDownload: ' + result.message);
        return payload.cb(result,null);
    }

    /**
     * Sube las marcas realizadas en modo offline
     *
     * @param string elements
     * @param function cb
     * @return Callback
     */
    app.uploadData = function(elements, cb) {

        if (elements.length > 0) {

            var _callback = cb;
            var data = dataBase.result.transaction(["users"], "readonly").objectStore("users");
            var index = data.index("by_logged");
            var request = index.get("1");

            request.onsuccess = function(e) {
                var result = e.target.result;

                if (typeof result !== "undefined") {
                    $.ajax({
                        url: SPOTCONTROL.API + "upload" + '?jwt=' + result.jwt,
                        //url: SPOTCONTROL.API + "upload",
                        type: "POST",
                        dataType: 'json',
                        data: {
                            'elements': elements,
                        },
                        beforeSend: function(xhr) {
                            //xhr.setRequestHeader('Authorization', 'Bearer ' + result.jwt);
                            //xhr.setRequestHeader('jwt', result.jwt);
                            checkConnectionStatus();
                            showLoader('Actualizando los datos, por favor aguarde unos instantes')
                        }
                    }).then(
                        app.successUploading.bind(null, {cb: _callback}),
                        app.errorUploading.bind(null, {cb: _callback})
                    );
                } else {
                    console.log("[uploadData] Error al realizar upload");
                    return _callback(new Error("[uploadData] Error al realizar upload"));
                }
            };

            request.onerror = function() {
                console.log("[uploadData] Error al realizar upload");
                return _callback(new Error("[uploadData] Error al realizar upload"));
            };
        } else {
            return cb(null, null);
        }
    };

    /**
     * Atiende el envío exitoso de datos
     *
     * @param object payload
     * @param object result
     * @return Callback
     */
    app.successUploading = function (payload, result) {
        if (result) {
            var data = dataBase.result.transaction(['spotcontrol_details'], 'readwrite');
            var object = data.objectStore('spotcontrol_details');
            object.clear();
            console.log('[syncUpload] AJAX syncUpload exitoso');
            return payload.cb(null,null);
        } else {
            console.log('[syncUpload] AJAX syncUpload failed from WS');
            return payload.cb(new Error('[syncUpload] AJAX syncUpload failed from WS'));
        }
    }

    /**
     * Atiende los errores de envío de datos
     *
     * @param object payload
     * @param object result
     * @return Callback
     */
     app.errorUploading = function (payload, result) {
         console.log('[Error] AJAX syncUpload: ' + result.message);
         return payload.cb(result,null);
    }

    /**
     * Verifica si los objetos ya se encuentran cargados en el almacenamiento local
     *
     * @param string type Tipo de objeto a verificar (persons, vehicles)
     * @return void
     */
    app.syncAllData = function() {
        var msg = '';
        var msgType = '';

        var url = SPOTCONTROL.API + "upload";
        var data = dataBase.result.transaction(['spotcontrol_details'], "readonly");
        var object = data.objectStore('spotcontrol_details');
        var cursor = object.openCursor();
        var elements = [];

        cursor.onsuccess = function(e) {
            var result = e.target.result;
            if (result === null) {
                return;
            }
            elements.push(result.value);
            result.continue();
        };

        data.oncomplete = function(e) {
            isOnline(
                function() {
                    var msg = '';
                    var msgType = '';

                    async.series([
                        app.uploadData.bind(null, elements),
                        app.loadDataFromAPI.bind(null, 'vehicles'),
                        app.loadDataFromAPI.bind(null, 'persons')
                    ], function(err, result) {
                        if (err) {
                            console.log(err);
                            msg = 'Hubo un error en la actualización los datos';
                            msgType = 'alert-danger';
                            disabledButtons(false);
                            hideLoader(msg, msgType);
                        } else {
                            var expiration = dataBase.result.transaction(['expiration'], 'readwrite');
                            var expirationObject = expiration.objectStore('expiration');
                            msg = 'Se actualizaron todos los datos';
                            msgType = 'alert-success';
                            expirationObject.clear();
                            expirationObject.put({
                                date: Date.now()
                            });
                            disabledButtons(false);
                            hideLoader(msg, msgType);
                            $('.card-searcher').removeClass('hidden');
                            $('.login-form').removeClass('hidden');
                            $('.input-group').removeClass('hidden');
                            $('.loader').addClass('hidden');
                        }
                    });
                }, function() {
                    console.log('[syncUpload] offline');
                }
            );
        };

        data.onerror = function(e) {
            var msg = 'Hubo un error al sincronizar los datos';
            var msgType = 'alert-danger';
            showSyncAll = 0;

            console.log('[Error] spotcontrol_details: ' + data.error.name + ', ' + data.error.message);
            hideLoader(msg, msgType);
        };
    }

    /**
     * Realiza el borrado de los datos del objeto dentro del almacenamiento local deseado
     *
     * @param string type Objeto a borrar
     * @return void
     */
    app.clear = function(type) {

        var data = dataBase.result.transaction([type], "readwrite");
        var object = data.objectStore(type);
        object.clear();
        data.oncomplete = function(event) {
            console.log('Limpiando ' + type);
        };
    };

    /**
     * Almacenamiento de los vehiculos localmente
     * @return void
     */
    app.saveEntities = function(type, values) {
        app[type] = values;
        let data = dataBase.result.transaction([type], "readwrite");
        let object = data.objectStore(type);
        console.log(type,':',values);

        for(let iEntity = 0; iEntity < values.length; iEntity += 1) {
          let request = object.put(values[iEntity]);
          request.onerror = function(e) {
            console.log(request.error.name + '\n\n' + request.error.message);
          };
        }
        console.log('Saving data into localStorage', type);
    };

    // Boton login
    $('#btnSubmit').on('click', function() {
        if ($('.login-form').validate().form()) {
            app.login();
        }
    });
    // Boton marcar vehiculo/persona
    $('#mark').on('click', function() {
        app.mark();
    });
    // Boton buscar vehiculo
    $('#btn_search_vehicle').on('click', function() {
        searchItem('vehicle');
    });
    // Boton buscar persona
    $('#btn_search_person').on('click', function() {
        searchItem('person');
    });
    // Buscar vehiculo al presionar ENTER
    $('#input_plate_number').on('keypress', function (e) {
        if (e.which == 13) {
            searchItem('vehicle');
        }
    });
    // Buscar persona al presionar ENTER
    $('#input_dni').on('keypress', function (e) {
        if (e.which == 13) {
            searchItem('person');
        }
    });
    // Boton actualizar posición
    $('#btn_refresh_position').on('click', function(e){
        disabledButtons(true);
        getPosition(true);
    });
    // Boton sincronizar datos
    $('#btn_sync_all').on('click', function(e){
        isOnline(
            function() {
                disabledButtons(true);
                app.checkExpiration(true);
            }, function() {
                $('.alert-message')
                    .html('No hay conexión disponible, la actualización no se ha realizado')
                    .addClass('alert-warning')
                    .removeClass('hidden');
            }
        );
    });
    // Boton cerrar sesión
    $('#btn_logout').on('click', function(e){
        app.logout();
    });

    /**
     * Buscar item (persona o vehículo) ingresado por el usuario
     * @param String field Item a buscar
     * @return void
     */
    function searchItem(field) {
        $('.alert-message').addClass('hidden');
        switch (field) {
            case 'vehicle':
                if ($('#input_plate_number').val().length > 0) {
                    var vehicle = app.findVehicle($('#input_plate_number').val().toUpperCase());
                } else {
                    noResult('Por favor, ingrese la patente para realizar la búsqueda', 'alert-warning', false, '');
                }
                break;
            case 'person':
                if ($('#input_dni').val().length > 0) {
                    var person = app.findPerson($('#input_dni').val());
                } else {
                    noResult('Por favor, ingrese el dni para realizar la búsqueda', 'alert-warning', false, '');
                }
                break;
        }
    }

    /**
     * Activar o desactivar los botones de acción del usuario
     * @param Boolean val Valor booleano que activa o desactiva los botones
     * @return void
     */
    function disabledButtons(val) {
        $('#btn_refresh_position').attr('disabled', val);
        $('#btn_sync_all').attr('disabled', val);
        $('#btn_logout').attr('disabled', val);
    }

    /**
     * Mostrar loader / spinner con mensaje de acción a realizar
     *
     * @param String msg Mensaje de acción a realizar
     * @return void
     */
    function showLoader(msg, $class) {
        $('.login-form').addClass('hidden');
        $('.input-group').addClass('hidden');
        $('.alert-message').addClass('hidden');
        $('.card-result').addClass('hidden');
        $('.card-marker').addClass('hidden');
        $('.loader-message').html(msg);
        $('.loader').removeClass('hidden');
    }

    /**
     * Ocultar loader / spinner con mensaje de respuesta
     *
     * @param String msg Mensaje de respuesta de acción realizada
     * @return void
     */
    function hideLoader(msg, $class, showMsg = true) {
        $('.input-group').removeClass('hidden');
        $('.login-form').removeClass('hidden');
        $('.alert-message').html(msg);
        $('.alert-message')
            .removeClass('alert-warning')
            .removeClass('alert-danger')
            .removeClass(showMsg ? 'hidden' : '')
            .addClass($class);
        $('.loader').addClass('hidden');
    }

    /**
     * Redireccionar a url especificada
     *
     * @param String url Página a redireccionar
     * @param String msg Mensaje a mostrar antes de redireccionar
     * @param Integer seconds Segundos a esperar antes de ser redireccionado
     * @return void
     */
    function redirect(url, msg = '', seconds = 3) {
        $('.alert-message')
            .html(msg)
            .addClass('alert-info')
            .removeClass('hidden');
        setTimeout(function() {
            window.location.replace(url);
        }, seconds * 1000);
    }

    function checkConnectionStatus() {
        const connectionEffectiveType = navigator.connection.effectiveType;

        // check if effectiveType is supported
        if (connectionEffectiveType) {
            var slowConnection = true;

            switch (connectionEffectiveType) {
                case "slow-2g":
                case "2g":
                    slowConnection = true;
                    break;
                case "3g":
                case "4g":
                    slowConnection = false;
                    break;
            }

            if (slowConnection) {
                $('.alert-low-quality-connection').html('Se ha detectado una conexión de baja calidad');
                $('.alert-low-quality-connection').removeClass('hidden');
            }
        }
    }

    /**
     * Obtención de la fecha actual
     * @return {string} Retorna fecha actual en formato dd/mm/yyyy:h:m:s
     */
    function today() {
        var d = new Date();
        var month = d.getMonth() + 1;
        var day = d.getDate();
        var hour = d.getHours();
        var minute = d.getMinutes();
        var seconds = d.getSeconds();
        var output = d.getFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day + ' ' + hour + ':' + minute + ':' + seconds;
        return output;
    }

    /**
     * Obtención de la posición de estar disponible (latitud y longitud) desde donde se está usando a aplicación
     * @return void
     */
    function getPosition(forceUpdate) {
      if (navigator.geolocation) {
        //si actualizo la posición por pedido del usuario
        if (forceUpdate) {
            disabledButtons(true);
            showLoader('Obteniendo ubicación, por favor aguarde unos instantes ...')
        }

        var options = {
            enableHighAccuracy: true,
            timeout: 30 * 1000,
            maximumAge: 5 * 60 * 1000
        };

        navigator.geolocation.getCurrentPosition(success, error, options);

        function success(position) {
            var coordenadas = position.coords;

            console.log('Tu posición actual es: lat=' + coordenadas.latitude + ', lon=' + coordenadas.longitude + ', ' + coordenadas.accuracy + ' metros.');

            $('#hidden_lng').val(coordenadas.latitude);
            $('#hidden_lat').val(coordenadas.longitude);

            //si actualizo la posición por pedido del usuario
            if (forceUpdate) {
                disabledButtons(false);
                hideLoader('Posición actualizada', 'alert-success');
            }

        };

        function error(error) {
            console.warn('ERROR(' + error.code + '): ' + error.message);

            $('#hidden_lng').val('');
            $('#hidden_lat').val('');
            $('#hidden_position').val('');

            //si actualizo la posición por pedido del usuario
            if (forceUpdate) {
                disabledButtons(false);
                hideLoader('Posición no actualizada', 'alert-warning');
            }
        }
      } else {
        console.log('[navigator.geolocation] false');
      }
    }

    /**
     * Muestra de los datos del vehículo en pantalla
     *
     * @param  {[json]} vehicles Datos del vehículo a mostrar
     * @return void
     */
     function showVehicleList(vehicles) {
        var card = "";
        $('.card-result').removeClass('hidden');
        $('.card-marker').removeClass('hidden');
        $.each(vehicles, function(key, data) {
            app.containerJQuery.empty();
            card = app.cardTemplate.cloneNode(true);
            card.classList.remove('card-template');
            app.container.appendChild(card);
            $('.passengersName').removeClass('hidden');
            $('.passengersDni').removeClass('hidden');
            $('.passengersStatus').removeClass('hidden');
            $('.title-driver-name').removeClass('hidden');
            $('.title-gps').removeClass('hidden');
            $('#hidden_plate_number').val(data.plate_number);
            $('#hidden_type').val('vehicle');
            $('#hidden_date_mark').val(today());
            $('#text_observations').val(null);
            $('.img-identifier').attr('src', 'assets/images/auto.png');
            $('.dniModel').html('Marca/Modelo/Color');
            card.querySelector('.person-name').textContent = data.plate_number;
            card.querySelector('.identifier').textContent = " " + data.brand + " " + data.model + " " + data.color;
            if (data.enable) {
                card.querySelector('.enable_indicator').classList.add('bg-green');
                $('.enable_indicator').html('Habilitado');
            } else {
                card.querySelector('.enable_indicator').classList.add('bg-red');
                $('.enable_indicator').html('En Falta');
            }
            if (!data.driver.enable) {
                color = 'label bg-red';
                status = 'En Falta';
            } else {
                color = 'label bg-green';
                status = 'Habilitado';
            }
            if (data.driver.dni == 'no_log' || data.driver.dni == 'NO LOG') {
                status = 'No identificado';
            }
            $('.img-driver').attr('src', 'assets/images/no-avatar.jpg');
            $('.driver-detail').append("<td><span class='bold passengersDni'><p><img class='img-circle' src='assets/images/no-avatar.jpg' height='30' width='30'>" + data.driver.fullname + "</p></span></td><td><span class='bold passengersStatus " + color + "'>" + status + "</span></td>");
            if (!data.gps) {
                color = 'label label-danger';
                var status = 'GPS Sin Comunicación';
            } else {
                color = 'label label-success';
                var status = 'GPS Funcionando';
            }
            $('.gps').append('<p><span class="' + color + '">' + status + '</span></p>');
            var color = "";
            if (data.passengers.length > 0) {
                for (var i = data.passengers.length - 1; i >= 0; i--) {
                    if (!data.passengers[i].enable) {
                        color = 'label label-danger';
                        status = 'En Falta';
                    } else {
                        color = 'label label-success';
                        status = 'Habilitado';
                    }
                    $('#detail-table').append("<tr><td><span class='bold passengersDni'><p><img class='img-circle' src='assets/images/no-avatar.jpg' height='30' width='30'>" + data.passengers[i].fullname + "</br>DNI: " + data.passengers[i].dni + "</p></span></td><td><span class='bold passengersStatus " + color + "'>" + status + "</span></td></tr>");
                    // $('.passengersName').append("<p><img class='img-circle' src='assets/images/no-avatar.jpg' height='30' width='30'>" + data.passengers[i].fullname + " </p>");
                    // $('.passengersDni').append("<p>" + data.passengers[i].dni + "&nbsp;&nbsp;<span class='" + color + "'>" + status + "</span></p>");
                }
            } else {
                $('.mobile-driver-name').append('<span> Sin Pasajeros</span>');
            }
            $.each(data.docs, function(i, item) {
                if (item === 'expired') {
                    $('.title-documents').removeClass('hidden');
                    status = "Vencido";
                    $('.documents').append('<p><span class="label label-danger">' + i + '-' + status + ' </span></p>');
                }
                if (item === 'missing') {
                    $('.title-documents').removeClass('hidden');
                    status = "Faltante";
                    $('.documents').append('<p><span class="label label-danger">' + i + '-' + status + ' </span></p>');
                }
                if (item === 'complete') {
                    $('.title-documents').removeClass('hidden');
                    status = "OK";
                    $('.documents').append('<p><span class="label label-success">' + i + '-' + status + ' </span></p>');
                }
            });
        });
    }

    /**
     * Muestra de los datos de la persona en pantalla
     *
     * @param  {[json]} vehicles Datos de la persona a mostrar
     * @return void
     */
     function showPersonList(persons) {
        var card = "";
        $.each(persons, function(key, data) {
            $('.card-result').removeClass('hidden');
            $('.card-template').removeClass('hidden');
            $('.list-results').empty();
            app.containerJQuery.empty();
            card = app.cardTemplate.cloneNode(true);
            app.container.appendChild(card);
            $('.title-documents').addClass('hidden');
            $('.passengersName').addClass('hidden');
            $('.passengersDni').addClass('hidden');
            $('.passengersStatus').addClass('hidden');
            $('.title-driver-name').addClass('hidden');
            $('.title-gps').addClass('hidden');
            $('#hidden_date_mark').val(today());
            $('#hidden_dni').val(data.dni);
            $('#text_observations').val(null);
            $('#hidden_type').val('person');
            $('.dniModel').html('DNI');
            $('.img-identifier').attr('src', 'assets/images/no-avatar.jpg');
            card.querySelector('.identifier').textContent = data.dni;
            card.querySelector('.person-name').textContent = data.fullname;
            if (data.enable) {
                card.querySelector('.enable_indicator').classList.add('bg-green');
                $('.enable_indicator').html('Habilitado');
            } else {
                card.querySelector('.enable_indicator').classList.add('bg-red');
                $('.enable_indicator').html('En Falta');
            }
            var status = "";
            $.each(data.docs, function(i, item) {
                if (item === 'expired') {
                    $('.title-documents').removeClass('hidden');
                    status = "Vencido";
                    $('.documents').append('<p><span class="label label-danger">' + i + ' - ' + status + ' </span></p> ');
                }
                if (item === 'missing') {
                    $('.title-documents').removeClass('hidden');
                    status = "Faltante";
                    $('.documents').append('<p><span class="label label-danger">' + i + ' - ' + status + ' </span> </p>');
                }
                if (item === 'complete') {
                    $('.title-documents').removeClass('hidden');
                    status = "OK";
                    $('.documents').append('<p><span class="label label-success">' + i + ' - ' + status + ' </span></p> ');
                }
            });
        });
    };

    /**
     * Mensaje a mostrar en caso de que se realice una búsqueda que no devuelve datos o se necesite mostrar información al usuario
     * que no provenga de la búsqueda de vehículos o personas
     *
     * @param  {string} message Mensaje a mostrar
     * @param  {Boolean} showMark true muestra opción de marcado, false mantiene oculta la opción de marcado
     * @param  {string} type Tipo de objeto a marcar vehicles o person
     * @return void
     */
     function noResult(msg, msgType, showMark, type) {
        $('.card-result').addClass('hidden');
        $('.alert-message')
            .html(msg)
            .removeClass('alert-warning')
            .removeClass('alert-danger')
            .removeClass('hidden')
            .addClass(msgType)
        $('.card-result').addClass('hidden');
        $('.title-documents').addClass('hidden');
        $('.passengersName').addClass('hidden');
        $('.passengersDni').addClass('hidden');
        $('.passengersStatus').addClass('hidden');
        if (showMark == true) {
            $('.card-marker').removeClass('hidden');
            $('.plateDni').removeClass('hidden');
            $('#hidden_date_mark').val(today());
            $('#text_observations').val(null);
            $('#hidden_type').val(type);
            $('#hidden_dni').val($('#input_dni').val());
            $('#hidden_plate_number').val($('#input_plate_number').val());
        } else {
            $('.card-marker').addClass('hidden');
        }
        $('.title-driver-name').addClass('hidden');
        $('.title-gps').addClass('hidden');
    }

    function isOnline(yes, no){
        var xhr = XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHttp');
        xhr.onload = function(){
            if(yes instanceof Function){
                yes();
            }
        }
        xhr.onerror = function(){
            if(no instanceof Function){
                no();
            }
        }
        xhr.open("HEAD",SPOTCONTROL.API,true);
        xhr.send();
      }

    /**
     * Registro del service worker que permite el trabajo en estado offline de la aplicación
     */
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register(SPOTCONTROL.domainPath + 'service-worker.js', {scope: SPOTCONTROL.domainPath}).then(function() {
                console.log('Service Worker Registered');
            }).catch(function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }

    app.startDB();

})();
