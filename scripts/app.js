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
    var active = null;
    var showSyncAll = 0;

    $('.alert').addClass('hidden');
    $('.card-searcher').addClass('hidden');
    $('.card-result').addClass('hidden');
    $('.input-group').addClass('hidden');
    $('.login-form').addClass('hidden');

    startDB();

    /**
     * Registro del service worker que permite el trabajo en estado offline de la aplicación
     */
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/service-worker.js').then(function() {
                console.log('Service Worker Registered');
            }).catch(function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }
    /**
     * Creación del almacén de objetos (DB)
     * @return void
     */
    function startDB() {
        dataBase = indexedDB.open("spotcontrol", 1);
        dataBase.onupgradeneeded = function(e) {
            active = dataBase.result;

            //Tabla Personas
            var object = active.createObjectStore("persons", {
                keyPath: 'id',
                autoIncrement: true
            });
            object.createIndex('by_dni', 'dni', {
                unique: false
            });
            //Tabla Vehículos
            object = active.createObjectStore("vehicles", {
                keyPath: 'id',
                autoIncrement: true
            });
            object.createIndex('by_plate_number', 'plate_number', {
                unique: false
            });
            //Tabla Marcado
            object = active.createObjectStore("spotcontrol_details", {
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
            object = active.createObjectStore("expiration", {
                keyPath: 'id',
                autoIncrement: true
            });
            //Tabla usuario logueado
            object = active.createObjectStore("users", {
                keyPath: 'id',
                autoIncrement: false
            });
            object.createIndex('by_username', 'username', {
                unique: false
            });
            object.createIndex('by_token', 'token', {
                unique: true
            });
        };
        dataBase.onsuccess = function(e) {
            console.log('[spotcontrol] Base de Datos Creada');
            active = dataBase.result;
            if (navigator.onLine) {
                syncAllData(false);
            } else {
                $('.card-searcher').removeClass('hidden');
                $('.login-form').removeClass('hidden');
                $('.input-group').removeClass('hidden');
                $('.loader').addClass('hidden');
            }
            getPosition(false);
            checkUser();

        };
        dataBase.onerror = function(e) {
            console.log('[Error] Creación de la DB');
        };
    }

    /*****************************************************************************
     *
     * Event listeners for UI elements
     *
     ****************************************************************************/
    /**
     * Ejecución del login a la aplicación, ejecuta el primer inicio de sesión al WS de ser éxitoso almacena internamente las credenciales
     * para poder realizar posteriores inicios de esión en modo offline
     ** @return void
     */
    $('#btnSubmit').on('click', function() {
        if ($('.login-form').validate().form()) {
            var url = apiDir + "login";
            var username = $('#username').val();
            var password = $('#password').val();
            //Logueo Online
            if (navigator.onLine) {
                $.ajax({
                    'url': url,
                    'type': "GET",
                    'dataType': 'json',
                    'data': {
                        'username': username,
                        'password': password,
                    },
                    //si la petición al WS devuelve datos
                    success: function(response) {
                        //Creación del token para logueo offline
                        var token = CryptoJS.HmacSHA256(username + password, keyPhrase);
                        var result = JSON.parse(JSON.stringify(response));
                        if (result) {
                            result.token = token.toString();
                        }
                        userLogin(result);
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        console.log("[Error] login online: " + textStatus);
                    }
                });
            //Logueo Offline
            } else {
                var token = CryptoJS.HmacSHA256(username + password, keyPhrase);
                var data = active.transaction(["users"], "readonly");
                var object = data.objectStore("users");
                var index = object.index("by_token");
                var request = index.get(token.toString());
                request.onsuccess = function() {
                    var result = request.result;
                    if (typeof result !== "undefined") {
                        userLogin(result);
                    } else {
                        $('#result').html("<div class='alert alert-danger'>Correo electrónico y/o contraseña incorrectos</div>");
                    }
                };
                request.onerror = function(e) {
                    console.log('[Error] login offline: ' + request.error.name + '\n\n' + request.error.message);
                };
            }
        }
    });


    /**
     * Ejecución del marcado como controlado, en modo online realiza ejecuta enviando la petición al WS
     * en modo offline, realiza el marcado dentro del almacenamiento interno
     * @return void
     */
    $('#mark').on('click', function() {
        var url = apiDir + "upload";
        var element = [];
        element.push({
            'lng':          $('#hidden_lng').val(),
            'lat':          $('#hidden_lat').val(),
            'position':     $('#hidden_position').val(),
            'observations': $('#text_observations').val(),
            'date':         $('#hidden_date_mark').val(),
            'plate_number': $('#hidden_plate_number').val(),
            'dni':          $('#hidden_dni').val(),
            'user_id':      $('#hidden_user_id').val(),
            'type':         $('#hidden_type').val()
        });
        if (navigator.onLine) {
            $.ajax({
                'url': url,
                'type': "GET",
                'dataType': 'json',
                'data': {
                    'elements': element
                },
                //si la petición al WS devuelve datos
                success: function(response) {
                    if (response) {
                        console.log('[spotcontrol_details] AJAX marcar vehículo o persona: ' + response);
                        app.noResult('Marcado exitosamente', false, '');
                    } else {
                        console.log('[spotcontrol_details] AJAX error en procesamiento: ' + response);
                    }
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('[Error] AJAX marcar vehículo o persona: ' + textStatus);
                }
            });
        } else {
            var data = active.transaction(["spotcontrol_details"], "readwrite");
            var object = data.objectStore("spotcontrol_details");
            var request = object.put(element[0]);

            request.onerror = function(e) {
                console.log('[Error] spotcontrol_details: ' + request.error.name + ', ' + request.error.message);
            };

            data.oncomplete = function(e) {
                console.log('[spotcontrol_details] Marcado exitosamente');
                app.noResult('Marcado exitosamente', false, '');
            };
        }
    });

    //Boton buscar vehiculo
    $('#btn_search_vehicle').on('click', function() {
        searchItem('vehicle');
    });
    //Boton buscar persona
    $('#btn_search_person').on('click', function() {
        searchItem('person');
    });
    //Buscar vehiculo al presionar ENTER
    $('#input_plate_number').on('keypress', function (e) {
        if (e.which == 13) {
            searchItem('vehicle');
        }
    });
    //Buscar persona al presionar ENTER
    $('#input_dni').on('keypress', function (e) {
        if (e.which == 13) {
            searchItem('person');
        }
    });
    //Boton actualizar posición
    $('#btn_refresh_position').on('click', function(){
        disabledButtons(true);
        getPosition(true);
    });
    //Boton sincronizar datos
    $('#btn_sync_all').on('click', function(){
        if (navigator.onLine) {
            disabledButtons(true);
            syncAllData(true);
        } else {
            $('.alert').html('No hay conexión disponible, la sincronización no se ha realizado');
            $('.alert').removeClass('hidden');
        }
    });
    //Boton cerrar sesión
    $('#btn_logout').on('click', function(){
        logout();
    });

    /**
     * Buscar usuario logueado, cambiar su estado (logged=false) y redireccionar
     * @return void
     */
    function logout() {
        var userId = $('#hidden_user_id').val();
        var data = active.transaction(["users"], "readwrite");
        var object = data.objectStore("users");
        var request = object.get(userId);

        request.onsuccess = function(e) {
            var result = e.target.result;
            if (result.logged) {
                var request = object.put({
                    id: result.id,
                    username: result.username,
                    token: result.token,
                    logged: false,
                    loginTime: result.loginTime,
                });
                request.onerror = function(e) {
                    console.log(request.error.name + ': ' + request.error.message + ', ' + e);
                };
                return;
            }
        };

        data.oncomplete = function(e) {
            redirect(domain + 'index.html', 'Su sesión se ha cerrado, redireccionando ...');
        };
    }

    /**
     * Buscar item (persona o vehículo) ingresado por el usuario
     * @param String field Item a buscar
     * @return void
     */
    function searchItem(field) {
        $('.alert').addClass('hidden');
        switch (field) {
            case 'vehicle':
                if ($('#input_plate_number').val().length > 0) {
                    var vehicle = app.findVehicle($('#input_plate_number').val().toUpperCase());
                } else {
                    app.noResult('Por favor, ingrese la patente para realizar la búsqueda', false, '');
                }
                break;
            case 'person':
                if ($('#input_dni').val().length > 0) {
                    var person = app.findPerson($('#input_dni').val());
                } else {
                    app.noResult('Por favor, ingrese el dni para realizar la búsqueda', false, '');
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
     * Sincronizar datos (persons, vehicles, spotcontrol_details)
     * @param boolean forceUpdate Si la sincronización es solicitada por el usuario o bien en cada refresh / expiración de datos
     * @return void
     */
    function syncAllData(forceUpdate) {
        showSyncAll = 0;
        showLoader('Sincronizando datos, por favor aguarde unos minutos ...');
        app.syncUpload();
        expiration(forceUpdate);
    }

    /**
     * Mostrar loader / spinner con mensaje de acción a realizar
     * @param String msg Mensaje de acción a realizar
     * @return void
     */
    function showLoader(msg) {
        $('.login-form').addClass('hidden');
        $('.input-group').addClass('hidden');
        $('.alert').addClass('hidden');
        $('.card-result').addClass('hidden');
        $('.card-marker').addClass('hidden');
        $('.loader-message').html(msg);
        $('.loader').removeClass('hidden');
    }

    /**
     * Ocultar loader / spinner con mensaje de respuesta
     * @param String msg Mensaje de respuesta de acción realizada
     * @return void
     */
    function hideLoader(msg) {
        $('.input-group').removeClass('hidden');
        $('.login-form').removeClass('hidden');
        $('.alert').html(msg);
        $('.alert').removeClass('hidden');
        $('.loader').addClass('hidden');
    }

    /**
     * Redireccionar a url especificada
     * @param String url Página a redireccionar
     * @param String msg Mensaje a mostrar antes de redireccionar
     * @param Integer seconds Segundos a esperar antes de ser redireccionado
     * @return void
     */
    function redirect(url, msg = '', seconds = 3) {
        $('.alert').html(msg);
        $('.alert').removeClass('hidden');
        setInterval(function() {
            window.location.replace(url);
        }, seconds * 1000);
    }


    /*****************************************************************************
     *
     * Sinconización y búsqueda
     *
     ****************************************************************************/
    /**
     * Sincronización inicial de los objetos (persons, vehicles, users), para el almacenamiento interno
     * @param  string type Es el tipo de objeto a sincronizar valores soportados vehicles, persons, users
     * @return void
     */
    app.firstSyncDownload = function(type) {
        var url = apiDir + type;

        $.ajax({
            'url': url,
            'type': "GET",
            'dataType': 'json',
            'data': type,
            'timeout': 30 * 60 * 1000,
            //si la petición al WS devuelve datos
            success: function(response) {
                var values = JSON.stringify(response);
                switch (type) {
                    case 'vehicles':
                        app.vehicles = values;
                        app.saveVehicles();
                        break;
                    case 'persons':
                        app.persons = values;
                        app.savePersons();
                        break;
                }
                console.log('[firstSyncDownload] (' + type + '): Getting data from WS');
                app.syncAllDataCheck();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.log('[Error] AJAX firstSyncDownload: ' + textStatus);
            },
            complete: function() {}
        });
    };

    /**
     * Función para la subida de los datos de vehículos controlado,la cual se ejecuta cada vez que la aplicación es
     * usada en estado online
     * @return void
     */
    app.syncUpload = function() {
        var url = apiDir + "upload";
        var data = active.transaction(['spotcontrol_details'], "readwrite");
        var object = data.objectStore('spotcontrol_details');
        var elements = [];
        object.openCursor().onsuccess = function(e) {
            var result = e.target.result;
            if (result === null) {
                return;
            }
            elements.push(result.value);
            result.continue();
        };
        data.oncomplete = function(e) {
            if (elements.length == 0) {
                console.log("[syncUpload] AJAX nada que sincronizar");
            } else if (navigator.onLine) {
                    $.ajax({
                        'url': url,
                        'type': "GET",
                        'dataType': 'json',
                        'data': {
                            'elements': elements,
                        },
                        //si la petición al WS devuelve datos
                        success: function(response) {
                            if (response) {
                                var data = active.transaction(['spotcontrol_details'], 'readwrite');
                                var object = data.objectStore('spotcontrol_details');
                                object.clear();
                                console.log('[syncUpload] AJAX syncUpload exitoso');
                                //$('#btnSyncAll').html('Actualizar datos (0)');
                            } else {
                                console.log('[syncUpload] AJAX syncUpload failed from WS');
                            }
                        },
                        error: function(jqXHR, textStatus, errorThrown) {
                            console.log('[Error] AJAX syncUpload: ', textStatus);
                        },
                        complete: function() {}
                    });
            } else {
                console.log('[syncUpload] offline');
            }
            app.syncAllDataCheck();
        };
    }

    /**
     * Verificar si se sincronizaron todos los dados (vehicles, persons, spotcontrol_details)
     * @return void
     */
    app.syncAllDataCheck = function() {
        //se sincronizan 3 tipos de elementos
        if (showSyncAll === 2) {
            disabledButtons(false);
            hideLoader('Se actualizaron todos los datos');
        } else {
            showSyncAll++;
        }
    }

    /**
     * Búsqueda individual de los vehículos, en estado online consulta al WS, en estado offline consulta el almacenamiento interno
     * @param  {string} plate_number Número de patente del vehículo
     * @return {json}   datos del vehículo
     */
    app.findVehicle = function(plate_number) {
        var url = apiDir + "vehicleByPlateNumber";
        var elements = [];
        var data = active.transaction(["vehicles"], "readonly");
        var object = data.objectStore("vehicles");
        var index = object.index("by_plate_number");
        var request = index.get(String(plate_number));
        request.onsuccess = function() {
            var result = request.result;
            elements.push(result);
            if (typeof result !== "undefined") {
                //getPosition();
                app.updateVehicleList(elements);
            } else {
                app.noResult('No encontramos el vehículo que busca', true, 'vehicle');
            }
            $('.card-marker').removeClass('hidden');
        };
        if (navigator.onLine) {
            $.ajax({
                'url': url,
                'type': "GET",
                'dataType': 'json',
                'data': {
                    'plate_number': plate_number
                },
                //si la petición al WS devuelve datos
                success: function(response) {
                    var vehicle = JSON.parse(JSON.stringify(response));
                    if (vehicle !== false) {
                        //getPosition();
                        app.updateVehicleList(vehicle);
                        console.log('[findVehicle] AJAX vehículo encontrado');
                    } else {
                        console.log('[findVehicle] AJAX vehículo NO encontrado');
                        app.noResult('No encontramos el vehículo que busca', true, 'vehicle');
                    }
                    $('.card-marker').removeClass('hidden');
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('[Error] AJAX findVehicle: ' + textStatus);
                }
            });
        } else {
            console.log('[findVehicle] offline')
        }
    };

    /**
     * Búsqueda individual de las personas, en estado online consulta al WS, en estado offline consulta el almacenamiento interno
     * @param  {string} dni Número de DNI de la persona
     * @return {json}   datos del vehículo
     */
    app.findPerson = function(dni) {
        var url = apiDir + "personByDni";
        var elements = [];
        var data = active.transaction(["persons"], "readonly");
        var object = data.objectStore("persons");
        var index = object.index("by_dni");
        var request = index.get(String(dni));
        request.onsuccess = function() {
            var result = request.result;
            elements.push(result);
            if (typeof result !== "undefined") {
                //getPosition();
                app.updatePersonList(elements);
            } else {
                app.noResult('No encontramos la persona que busca', true, 'person');
                //getPosition();
            }
            $('.card-marker').removeClass('hidden');
        };
        if (navigator.onLine) {
            $.ajax({
                'url': url,
                'type': "GET",
                'dataType': 'json',
                'data': {
                    'dni': dni
                },
                //si la petición al WS devuelve datos
                success: function(response) {
                    var person = JSON.parse(JSON.stringify(response));
                    if (person !== false) {
                        //getPosition();
                        app.updatePersonList(person);
                        console.log('[findPerson] AJAX persona encontrada');
                    } else {
                        //getPosition();
                        console.log('[findPerson] AJAX persona NO encontrada');
                        app.noResult('No encontramos la persona que busca', true, 'person');
                    }
                    $('.card-marker').removeClass('hidden');
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log('[Error] AJAX findPerson: ' + textStatus);
                }
            });
        } else {
            console.log("[findPerson] offline");
        }
    };

    /*****************************************************************************
     *
     * Actualización UI
     *
     ****************************************************************************/
    /**
     * Muestra de los datos del vehículo en pantalla
     * @param  {[json]} vehicles Datos del vehículo a mostrar
     * @return void
     */
    app.updateVehicleList = function(vehicles) {
        var card = "";
        $('.card-result').removeClass('hidden');
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
            $('#hidden_date_mark').val(app.today());
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
            $('.title-driver-name').append('<p>Chofer: <span>' + data.driver.fullname + "</span> <span class='" + color + "'>" + status + "</span></p>");
            if (!data.gps) {
                color = 'label label-danger';
                var status = 'Sin Comunicación';
            } else {
                color = 'label label-success';
                var status = 'Funcionando';
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
                    $('.passengersName').append("<p><img class='img-circle' src='assets/images/no-avatar.jpg' height='30' width='30'>" + data.passengers[i].fullname + " </p>");
                    $('.passengersDni').append("<p>" + data.passengers[i].dni + "&nbsp;&nbsp;<span class='" + color + "'>" + status + "</span></p>");
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
    };

    /**
     * Muestra de los datos de la persona en pantalla
     * @param  {[json]} vehicles Datos de la persona a mostrar
     * @return void
     */
    app.updatePersonList = function(persons) {
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
            $('#hidden_date_mark').val(app.today());
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
     * @param  {string} message Mensaje a mostrar
     * @param  {Boolean} showMark true muestra opción de marcado, false mantiene oculta la opción de marcado
     * @param  {string} type Tipo de objeto a marcar vehicles o person
     * @return void
     */
    app.noResult = function(message, showMark, type) {
        $('.card-result').addClass('hidden');
        $('.alert').html(message);
        $('.alert').removeClass('hidden');
        $('.card-result').addClass('hidden');
        $('.title-documents').addClass('hidden');
        $('.passengersName').addClass('hidden');
        $('.passengersDni').addClass('hidden');
        $('.passengersStatus').addClass('hidden');
        if (showMark == true) {
            $('.card-marker').removeClass('hidden');
            $('.plateDni').removeClass('hidden');
            $('#hidden_date_mark').val(app.today());
            $('#text_observations').val(null);
            $('#hidden_type').val(type);
            $('#hidden_dni').val($('#input_dni').val());
            $('#hidden_plate_number').val($('#input_plate_number').val());
        } else {
            $('.card-marker').addClass('hidden');
        }
        $('.title-driver-name').addClass('hidden');
        $('.title-gps').addClass('hidden');
    };

    /*****************************************************************************
     *
     * Metodos de consulta y almacenamiento
     *
     ****************************************************************************/
    /**
     * Registra la sesión del usuario
     * @param  {json} result datos del usuario a registrar de ser vacio redirije a la página de inicio de sesión
     * @return void
     */
    function userLogin(result) {
        if (result) {
            var data = active.transaction(["users"], "readwrite");
            var object = data.objectStore("users");
            var request = object.put({
                id: result.id,
                username: result.username,
                token: result.token,
                logged: true,
                loginTime: Date.now(),
            });
            request.onerror = function(e) {
                console.log(request.error.name + '\n\n' + request.error.message);
                window.location.replace(domain + "index.html");
            };
            data.oncomplete = function(e) {
                window.location.replace(domain + "mark.html");
            };
        } else {
            $('#result').html("<div class='alert alert-danger'>Correo electrónico y/o contraseña incorrectos</div>");
        }
    }

    /**
     * Verifica si la sesión de usuario existe o está vencida
     * @return void
     */
    function checkUser() {
        var data = active.transaction(['users'], 'readwrite');
        var object = data.objectStore('users');
        object.openCursor().onsuccess = function(e) {
            var result = e.target.result;
            var url;
            if (result === null || !result.value.logged) {
                console.log('Usuario No Logueado');
                url = domain + 'index.html';
                if (window.location != url) {
                    redirect(url, 'No ha iniciado sesión, redireccionando ...');
                }
            } else {
                var date1 = moment(result.value.loginTime);
                var date2 = moment(Date.now());
                console.log('Usuario Logueado');
                $('#hidden_user_id').val(result.value.id);
                if (date2.diff(date1, 'hours') > sessionTime) {
                    console.log('Sesión Vencida');
                    object.clear();
                    url = domain + 'index.html';
                    if (window.location != url) {
                        redirect(url, "Su sesión ha vencido, redireccionando ...");
                    }
                } else if(result.value.logged) {
                    url = domain + 'mark.html';
                    if (window.location != url) {
                        $('.login-form').html("Usted ya ha iniciado sesión, redireccionando ...");
                        redirect(url);
                    }
                }
            }
        }
    }

    /**
     * Verifica si la fecha de vencimiento de los datos de los objetos vehicles, persons y users fue superada de ser así limpia las tablas y estipula como nueva
     * fecha de vencimiento la actual
     * @param Boolean forceUpdate Indica si 
     * @return void
     */
    function expiration(forceUpdate = false) {
        var data = active.transaction(['expiration'], 'readwrite');
        var object = data.objectStore('expiration');
        object.openCursor().onsuccess = function(e) {
            var result = e.target.result;
            if (result === null) {
                console.log('[Expiration] Sin datos');

                loadAll('persons');
                loadAll('vehicles');

                object.put({
                    date: Date.now()
                });

            } else {

                //si el usuario fuerza la actualización de datos
                if (forceUpdate) {
                    clear('persons');
                    clear('vehicles');

                    loadAll('persons');
                    loadAll('vehicles');

                } else {
                    var date1 = moment(result.value.date);
                    var date2 = moment(Date.now());

                    if (date2.diff(date1, 'hours') > expiredTime) {
                        console.log('[Expiration] Sincronización data vencida');

                        clear('persons');
                        clear('vehicles');

                        loadAll('persons');
                        loadAll('vehicles');

                        object.put({
                            date: Date.now()
                        });

                    } else {
                        $('.input-group').removeClass('hidden');
                        $('.login-form').removeClass('hidden');
                        $('.card-searcher').removeClass('hidden');
                        $('.loader').addClass('hidden');
                    }
                }
            }
        };
    }

    /**
     * Verifica si los objetos ya se encuentran cargados en el almacenamiento local
     * @param  {string} type Tipo de objeto a verificar (persons, vehicles, users)
     * @return void
     */
    function loadAll(type) {
        var data = active.transaction([type], "readonly");
        var object = data.objectStore(type);
        var elements = [];
        object.openCursor().onsuccess = function(e) {
            var result = e.target.result;
            if (result === null) {
                return;
            }
            elements.push(result.value);
            result.continue();
        };
        data.oncomplete = function() {
            if (elements.length > 0) {
                console.log('No hace falta sincronizar' + type);
            } else {
                console.log('Sincronizando ' + type);
                app.firstSyncDownload(type);
            }
        };
    }

    /**
     * Realiza el borrado de los datos del objeto dentro del almacenamiento local deseado
     * @param  {string} type Objeto a borrar (persons, vehicles, users)
     * @return void
     */
    function clear(type) {

        var active = dataBase.result;
        var data = active.transaction([type], "readwrite");
        var object = data.objectStore(type);
        object.clear();
        data.oncomplete = function(event) {
            console.log('Limpiando ' + type);
        };
    }

    /**
     * Almacenamiento de los vehiculos localmente
     * @return void
     */
    app.saveVehicles = function() {
        var data = active.transaction(["vehicles"], "readwrite");
        var object = data.objectStore("vehicles");
        var vehicles = JSON.parse(app.vehicles);

        $.each(vehicles, function(key, vehicle) {
            var request = object.put({
                id: vehicle.id,
                plate_number: vehicle.plate_number,
                name: vehicle.name,
                brand: vehicle.brand,
                model: vehicle.model,
                color: vehicle.color,
                enable: vehicle.enable,
                gps: vehicle.gps,
                docs: vehicle.docs,
                passengers: vehicle.passengers,
                driver: vehicle.driver,
            });
            request.onerror = function(e) {
                console.log(request.error.name + '\n\n' + request.error.message);
            };
            request.onsuccess = function(e) {}
        });

        console.log('Saving data into localStorage Vehicles');
    };

    /**
     * Almacenamiento de las personas localmente
     * @return void
     */
    app.savePersons = function() {
        var data = active.transaction(["persons"], "readwrite");
        var object = data.objectStore("persons");
        var persons = JSON.parse(app.persons);

        $.each(persons, function(key, person) {
            var request = object.put({
                id: person.id,
                dni: person.dni,
                fullname: person.fullname,
                enable: person.enable,
                docs: person.docs,
            });
            request.onerror = function(e) {
                console.log(request.error.name + '\n\n' + request.error.message);
            };
        });

        console.log('Saving data into localStorage Persons');
    };

    /*****************************************************************************
     *
     * Methods Generales
     *
     ****************************************************************************/
    /**
     * Obtención de la fecha actual
     * @return {string} Retorna fecha actual en formato dd/mm/yyyy:h:m:s
     */
    app.today = function() {
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
                showLoader('Obteniendo ubicación, por favor aguarde unos minutos ...')
            }

            var options = {
                enableHighAccuracy: true,
                timeout: 5 * 1000,
                maximumAge: 5 * 60 * 1000
            };

            navigator.geolocation.getCurrentPosition(success, error, options);

            function success(position) {
                var coordenadas = position.coords;

                console.log('Tu posición actual es:');
                console.log('Latitud : ' + coordenadas.latitude);
                console.log('Longitud: ' + coordenadas.longitude);
                console.log('Más o menos ' + coordenadas.accuracy + ' metros.');

                $('#hidden_lng').val(coordenadas.latitude);
                $('#hidden_lat').val(coordenadas.longitude);

                //si actualizo la posición por pedido del usuario
                if (forceUpdate) {
                    disabledButtons(false);
                    hideLoader('Posición actualizada');
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
                    hideLoader('Posición no actualizada');
                }
            }

        } else {
            console.log('[navigator.geolocation] false');
        }
    }

})();
